const { ObjectId } = require('mongodb');

export default class ExerciseDAO {
  let exerciseCollection;
  
  // Get handle to collection.
  static injectDB(client) {
    if (exerciseCollection) {
      return;
    }
    try {
      const fccDb = client.db(process.env.DB_NAME);
      exerciseCollection = fccDb.collection(process.env.DB_COLLECTION);
    } catch (e) {
      console.error(`Unable to establish collection handle in DAO: ${e}`);
    }
  }

  
  // Responds with JSON containing username and _id.
  static createUser(uname) {
    // Attempt to create a new record for the user.
    exerciseCollection.insertOne({"username": uname})
      .then((result) => {
        if (result.acknowledged) {
          // Success: The user didn't already exist.
          console.log('\nNew user:');
          const newUserJSON = {
            "username": uname,
            "_id": result.insertedId
          };
          console.log(newUserJSON);
          return newUserJSON;
        } else {
          // Failure: The username has already been taken.
          // Get that user's ID and return it.
          exerciseCollection.findOne({"username": uname})
            .then((doc) => {
              if (doc) {
                console.log('\nCould not create new user: Desired username already in use.');
                const existingUserJSON = {
                  "username": doc.username,
                  "_id": doc._id
                };
                console.log(existingUserJSON);
                return existingUserJSON;
              } else {
                console.log('\nCritical error: User could not be created or located.');
                return {"error": "database error"};
              }
            });
        }
      });
  }


  // Get an array containing all user information.
  static getAllUserInfo() {
    const cursor = exerciseCollection.find();
    cursor.toArray()
      .then((result) => {
        if (Array.isArray(result)) {
          console.log('\nUser requested list of all users.')
          return result;
        } else {
          console.log('\nFailed to fulfill user\'s request for list of users.');
          return [];
        }
      });
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
  static addExerciseToUser(userId, desc, duration, date) {
    console.log();
    
    // Make sure the user truly provided an ID parameter
    if (userid === undefined) {
      console.log('User wanted to add exercise but failed to provide ID.');
      return {"error": "missing id"};
    }
    
    // Make sure the ID is a valid MongoDB ObjectID
    if (!ObjectId.isValid(userId)) {
      console.log('Invalid user ID format.');
      return {"error": "invalid id format"});
    }
    const userObjectId = new ObjectId(userId);
    
    // Convert the duration to a Number
    const duration = Number(duration);
    if (Number.isNaN(duration)) {
      console.log('Invalid duration.');
      return {"error": "invalid duration"};
    }
  
    // Validate the date parameter
    if (date === undefined {
      date = new Date();
    } else {
      // Strategy to prevent dates from being off by one day:
      // https://stackoverflow.com/a/63185483
      date = new Date(req.body.date.replace(/-/g, '\/'));
      if (isNaN(date)) {
        console.log('Invalid date.');
        return {"error": "invalid date"};
      }
    }
    
    // Save all the above exercise data in an object.
    // This object will be added to the user's log in the database.
    let newExercise = {
      "description": desc,
      "duration": duration,
      "date": date
    };
  
    exerciseCollection.findOneAndUpdate(
      { "_id": userObjectId },
      { "$push": { "log": newExercise } }   
    )
      .then((result) => {
        if (result.ok) {
          // Return to the user a combination of
          // the user object and new exercise object
          newExercise.date = date.toDateString();
          newExercise.username = result.value.username;
          newExercise._id = result.value._id.toString();
          console.log('Added new exercise:');
          console.log(newExercise);
          return newExercise;
        } else {
          console.log('The update failed.');
          return {"error": "unable to add new exercise to given user"};
        }
      });
  }


  // Get a user's information and complete exercise log.
  // Contains additional "count" field of all exercises.
  //
  // User can specify from, to, and limit parameters.
  // from:   start date
  // to:     end date
  // limit:  max number of exercises to get
  
  // First, save these aggregate pipeline stages
  // outside of the app.get() function
  // since they will be used repeatedly.
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
  const regroupStage = {
    "$group": {
      "_id": "$_id", 
      "username": {"$first": "$username"}, 
      "count": {"$first": "$count"}, 
      "log": {"$push": "$log"}
    }
  };
  
  static getExerciseLog(userId, from, to, limit) => {
    // Make sure the user truly provided an ID parameter
    if (userId === undefined) {
      console.log('\nRequested user info but failed to provide ID.');
      return {"error": "missing id"};
    }
    
    // Validate the ID string
    console.log(`\nGet exercise log for user ID ${userId}.`);
    if (!ObjectId.isValid(userId)) {
      console.log('Invalid user ID format.');
      return {"error": "invalid id format"};
    }
    const userObjectId = new ObjectId(userId);
    
    // Initialize the aggregation pipeline
    let exerciseLogPipeline = [
      {
        "$match": { "_id": userObjectId }
      },
      {
        "$addFields": {
          "count": {"$size": "$log"}
        }
      }
    ];
    
    // Check if there were any search parameters in the request.
    // If there were, make sure the input was valid.
    if (Object.entries(req.query).length > 0) {
      console.log('Log filter parameters:');
      console.log(req.query);
      
      // Validate the "from" date parameter
      let fromDate;
      if ('from' in req.query) {
        fromDate = new Date(req.query.from.replace(/-/g, '\/'));
      }
      const fromDateWasValid = (typeof fromDate !== undefined && !isNaN(fromDate));
      
      // Validate the "to" date parameter
      let toDate;
      if ('to' in req.query) {
        toDate = new Date(req.query.to.replace(/-/g, '\/'));
      }
      const toDateWasValid = (typeof toDate !== undefined && !isNaN(toDate));
      
      // Validate the "limit" parameter
      let limit;
      if ('limit' in req.query) {
        limit = parseInt(req.query.limit);
      }
      const limitWasValid = (!isNaN(limit) && limit > 0);
      
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
          exerciseLogPipeline.push({"$limit": limit}); 
        }
        
        exerciseLogPipeline.push(regroupStage);
      } else {
        console.log('None of the search parameters were valid.');
      }
    }
    
    // Execute the search
    const cursor = exerciseCollection.aggregate(exerciseLogPipeline);
    
    // Since the app searches by _id, which is a unique value,
    // no more than 1 document is expected to be returned.
    // Therefore, instead of having to use forEach(),
    // we can simply use next() to see if it's there.
    cursor.next()
      .then((doc) => {
        if (!doc) {
          console.log('Nothing was found.');
          return {"error": "search failed"};
        } else {
          // However, the "log" field in each document is an array,
          // so we must use forEach() to iterate through it.
          // So far, I have not found a way to convert a Date
          // to a date string with a format like "Mon Jan 01 1990"
          // solely within MongoDB, so it is done here in the web app.
          doc.log.forEach((exerciseLog) => {
            const newDate = new Date(exerciseLog.date);
            exerciseLog.date = newDate.toDateString();
          });
          console.log(doc);
          return doc;
        }
      });
  }
}
