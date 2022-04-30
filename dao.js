require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const unwindAndSortStages = [
  {
    "$unwind": "$log"
  },
  {
    "$sort": {
      "log.date": 1
    }
  }
];

/*
const getBackFieldsStage = {
  "$addFields": {
    "log.date": {
      "$dateToString": {
        "date": "$log.date", 
        "format": "%Y-%m-%d", 
        "timezone": "-06:00"
      }
    }
  }
};
*/

const regroupStage = {
  "$group": {
    "_id": "$_id", 
    "username": {"$first": "$username"}, 
    "count": {"$first": "$count"}, 
    "log": {"$push": "$log"}
  }
};

class ExerciseDAO {
  #exerciseCollection;
  #db;
  #client;
  
  // Connect to DB and get handle to collection.
  constructor() {
    this.client = new MongoClient(process.env.DB_URI);
    this.client.connect()
      .then(() => {
        console.log('Connected to the database.');
        this.db = this.client.db(process.env.DB_NAME);
        this.exerciseCollection = this.db.collection(process.env.DB_COLLECTION);
      })
      .catch((e) => {
        console.error(e);
        process.exit(1);
      });
  }

  
  // Responds with JSON containing username and _id.
  async createUser(uname) {
    // Attempt to create a new record for the user.
    let insertResult;
    try {
      insertResult = await this.exerciseCollection.insertOne({"username": uname});
    } catch(error) {
      if (error.code === 11000) {
        // Duplicate key error: Find and return the existing user
        let findResult = this.exerciseCollection.findOne({"username": uname});
        if (findResult) {
          const existingUserJSON = {
            "username": findResult.username,
            "_id": findResult._id.toString()
          };
          return existingUserJSON;  
        } else {
          return {"error": "duplicate key error, yet findOne failed"}; 
        }
      } else {
        console.error(error);
        return {"error": "mongodb error code ${error.code}"};
      }
    }
    
    if (insertResult.acknowledged) {
      // Success: The user didn't already exist.
      const newUserJSON = {
        "username": uname,
        "_id": insertResult.insertedId.toString()
      };
      return newUserJSON;
    } else {
      // Even though a duplicate key wasn't caught,
      // maybe the username has already been taken.
      const findResult = await this.exerciseCollection.findOne({"username": uname});
      if (findResult) {
        const existingUserJSON = {
          "username": findResult.username,
          "_id": findResult._id.toString()
        };
        return existingUserJSON;
      } else {
        return {"error": "unknown error"};
      }
    }
  }


  // Get an array containing all user information.
  async getAllUserInfo() {
    const cursor = this.exerciseCollection.find();
    const result = await cursor.toArray();
    return result;
  }


  // Add an exercise to a user's log.
  //
  // Responds with JSON containing:
  // username
  // _id
  // description: of exercise; String
  // duration:    in minutes; must be Number
  // date:        if not specified, current.
  //              must be in datestring format from Date API
  async addExerciseToUser(userId, desc, duration, date) {    
    // Make sure the ID is a valid MongoDB ObjectID
    if (!ObjectId.isValid(userId)) {
      return {"error": "invalid id format"};
    }
    const userObjectId = new ObjectId(userId);
    
    // Convert the duration to a Number
    duration = Number(duration);
    if (Number.isNaN(duration)) {
      return {"error": "invalid duration"};
    }
  
    // Convert the date string to a Date object (if necessary)
    if (date !== null) {
      // To prevent dates from being off by one day,
      // replace "-" in date with "/".
      // https://stackoverflow.com/a/63185483
      date = new Date(date.replace(/-/g, '\/'));
      if (isNaN(date)) {
        return {"error": "invalid date"};
      }
    } else {
      date = new Date();
    }
    
    // Save all the above exercise data in an object.
    // This object will be added to the user's log in the database.
    let newExercise = {
      "description": desc,
      "duration": duration,
      "date": date
    };
  
    const result = await this.exerciseCollection.findOneAndUpdate(
      { "_id": userObjectId },
      { "$push": { "log": newExercise } }   
    );
    
    if (result && result.ok) {
      // Return to the user a combination of
      // the user object and new exercise object
      newExercise.date = date.toDateString();
      newExercise.username = result.value.username;
      newExercise._id = result.value._id.toString();
      return newExercise;
    } else {
      return {"error": `unable to add exercise to ${userID}`};
    }
  }


  // Get a user's information and complete exercise log.
  // Contains additional "count" field of all exercises.
  //
  // User can specify from, to, and limit parameters.
  // from:   start date
  // to:     end date
  // limit:  max number of exercises to get
  async getExerciseLog(userId, from, to, limit) {
    // Validate the ID string
    if (!ObjectId.isValid(userId)) {
      return {"error": "invalid id"};
    }
    const userObjectId = new ObjectId(userId);
    
    // Initialize the aggregation pipeline
    let exerciseLogPipeline = [
      {
        "$match": { "$and": [
            { "_id": userObjectId },
            { "log": {"$exists": true } }
          ]
        }
      },
      {
        "$addFields": {
          "count": {"$size": "$log"}
        }
      }
    ];
      
    // Validate the "from" date parameter
    let fromDate;
    let fromDateWasValid = false;
    if (from !== null) {
      fromDate = new Date(from.replace(/-/g, '\/'));
      fromDateWasValid = !isNaN(fromDate);
    }
    
    // Validate the "to" date parameter
    let toDate;
    let toDateWasValid = false;
    if (to !== null) {
      toDate = new Date(to.replace(/-/g, '\/'));
      toDateWasValid = !isNaN(toDate);
    }
    
    // Validate the "limit" parameter
    let limitNum;
    let limitWasValid = false;
    if (limit !== null) {
      limitNum = parseInt(limit);
      limitWasValid = (!isNaN(limitNum) && limitNum > 0);
    }
    
    // Only continue if at least one of the 3 parameters was valid
    if (fromDateWasValid || toDateWasValid || limitWasValid) {
      exerciseLogPipeline.push(...unwindAndSortStages);
      
      if (fromDateWasValid && toDateWasValid) {
        // fromDate <= x <= toDate
        exerciseLogPipeline.push({
          "$match": {
            "$and": [
              {"log.date": {"$gte": fromDate} },
              {"log.date": {"$lte": toDate} }
            ]
          }
        });
      } else if (fromDateWasValid) {
        // fromDate <= x
        exerciseLogPipeline.push({
          "$match": {
            "log.date": {"$gte": fromDate}
          }
        });
      } else if (toDateWasValid) {
        // x <= toDate
        exerciseLogPipeline.push({
          "$match": {
            "log.date": {"$lte": toDate}
          }
        });
      }
      
      // The limit parameter determines how many entries
      // in the user's exercise log will be returned
      if (limitWasValid) {
        exerciseLogPipeline.push({"$limit": limitNum}); 
      }
      
      exerciseLogPipeline.push(regroupStage);
    }
    
    // Execute the search
    const cursor = this.exerciseCollection.aggregate(exerciseLogPipeline);
    
    // Since the app searches by _id, which is a unique value,
    // no more than 1 document is expected to be returned.
    // Therefore, instead of having to use forEach(),
    // we can simply use next() to see if it's there.
    let doc = await cursor.next();
    if (!doc) {
      // Perhaps the user exists but hasn't added to his/her log yet.
      const findResult = await this.exerciseCollection.findOne({"_id": userObjectId});
      if (findResult) {
        const userJSON = {
          _id: findResult._id.toString(),
          username: findResult.username,
          count: 0,
          log: []
        };
        return userJSON;
      } else {
        return {"error": "invalid user"}; 
      }
    } else {
      // The "log" field in the document is an array,
      // so we must use forEach() to iterate through it.
      // So far, I have not found a way to convert a Date
      // to a date string with a format like "Mon Jan 01 1990"
      // solely within MongoDB, so it is done here in the web app.
      doc.log.forEach((exerciseLog) => {
        const newDate = new Date(exerciseLog.date);
        exerciseLog.date = newDate.toDateString();
      });
      doc._id = doc._id.toString();
      return doc;
    }
  }
  
  
  disconnect() {
    this.client.close(); 
    console.log('MongoDB connection closed.');
  }
}

module.exports = { ExerciseDAO };