require('dotenv').config();
const express = require('express');
const app = express();

// Enable cross-origin resource sharing
// so freeCodeCamp can remotely test the app
const cors = require('cors');
app.use(cors());

// bodyparser needed to handle form input
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Create and set up handler to "exercise_tracker"
// collection within our MongoDB database
// so we can easily add and retrieve records
const { MongoClient, ObjectId } = require('mongodb');
const client = new MongoClient(process.env.DB_URI);
let exerciseCollection;
async function connectToMongo() {
  try {
    await client.connect();
    exerciseCollection = await client.db(process.env.DB_NAME)
                                     .collection(process.env.DB_COLLECTION);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
connectToMongo();


// Declare location of static assets
app.use(express.static('public'));


// Get main page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});


// Create new user.
// Responds with JSON containing username and _id.
app.post('/api/users', (req, res) => {
  // Attempt to create a new record for the user.
  exerciseCollection.insertOne({username: req.body.username})
    .then(result => {
      if (result.acknowledged) {
        // Success: The user didn't already exist.
        console.log('\nNew user:');
        const newUserJSON = { username: req.body.username, _id: result.insertedId };
        console.log(newUserJSON);
        res.json(newUserJSON);
      } else {
        // Failure: The username has already been taken.
        // Get that user's ID and return it.
        exerciseCollection.findOne({username: req.body.username})
          .then(doc => {
            if (doc) {
              console.log('\nCould not create new user: Desired username already in use.');
              const existingUserJSON = { username: doc.username, _id: doc._id };
              console.log(existingUserJSON);
              res.json(existingUserJSON);
            } else {
              console.log('\nCritical error: User could not be created or located.');
              res.json({error: "database error"})
            }
          });
      }
    });
});


// Get an array containing all user information.
app.get('/api/users', (req, res) => {;
  const cursor = exerciseCollection.find();
  cursor.toArray()
    .then(result => {
      if (Array.isArray(result)) {
        console.log('\nUser requested list of all users.')
        res.json(result);
      } else {
        console.log('\nFailed to fulfill user\'s request for list of users.');
        res.json([]);
      }
    });
});


// Add an exercise to a user's log.
//
// Responds with JSON containing:
// username
// _id
// description: of exercise; String
// duration:    in minutes; must be Number
// date:        if not specified, current.
//              must be in datestring format from Date API
app.post('/api/users/:_id/exercises', (req, res) => {
  console.log();
  
  // Make sure the user truly provided an ID parameter
  if (!('_id' in req.params)) {
    console.log('User wanted to add exercise but failed to provide ID.');
    res.json({error: "missing id"});
    return;
  }
  
  // Make sure the ID is a valid MongoDB ObjectID
  if (!ObjectId.isValid(req.params._id)) {
    console.log('Invalid user ID format.');
    res.json({error: "invalid id format"});
    return;
  }
  const userObjectId = new ObjectId(req.params._id);
  
  // Convert the duration to a Number
  const duration = Number(req.body.duration);
  if (Number.isNaN(duration)) {
    console.log('Invalid duration.');
    res.json({error: "invalid duration"});
    return;
  }

  // Save the date in a Date object,
  // which simultaneously validates it
  let date;
  if ('date' in req.body) {
    // Strategy to prevent dates from being off by one day:
    // https://stackoverflow.com/a/63185483
    date = new Date(req.body.date.replace(/-/g, '\/'));
    if (isNaN(date)) {
      console.log('Invalid date.');
      res.json({error: "invalid date"});
      return;
    }
  } else {
    // If no date was provided, get the current date
    date = new Date();
  }
  
  // Save all the above exercise data in an object.
  // This object will be added to the user's log in the database.
  let newExercise = {
    "description": req.body.description,
    "duration": duration,
    "date": date
  };

  exerciseCollection.findOneAndUpdate(
    { _id: userObjectId },
    { $push: { log: newExercise } }   
  )
    .then(result => {
      if (result.ok) {
        // Return to the user a combination of
        // the user object and new exercise object
        newExercise.date = date.toDateString();
        newExercise.username = result.value.username;
        newExercise._id = result.value._id.toString();
        console.log('Added new exercise:');
        console.log(newExercise);
        res.json(newExercise);
      } else {
        console.log('The update failed.');
        res.json({error: "unable to add new exercise to given user"});
      }
    });
});


// Get a user's information and complete exercise log.
// Contains additional "count" field of all exercises.
//
// User can add from, to, and limit parameters.
// format: GET /api/users/:_id/logs?[from][&to][&limit]
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

app.get('/api/users/:_id/logs', (req, res) => {
  // Make sure the user truly provided an ID parameter
  if (!('_id' in req.params)) {
    console.log('\nRequested user info but failed to provide ID.');
    res.json({error: "missing id"});
    return;
  }
  
  // Validate the ID string
  console.log(`\nGet exercise log for user ID ${req.params._id}.`);
  if (!ObjectId.isValid(req.params._id)) {
    console.log('Invalid user ID format.');
    res.json({error: "invalid id format"});
    return; 
  }
  const userObjectId = new ObjectId(req.params._id);
  
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
    .then(doc => {
      if (!doc) {
        console.log('Nothing was found.');
        res.json({error: "search failed"});
      } else {
        // However, the "log" field in each document is an array,
        // so we must use forEach() to iterate through it.
        // So far, I have not found a way to convert a Date
        // to a date string with a format like "Mon Jan 01 1990"
        // solely within MongoDB, so it is done here in the web app.
        doc.log.forEach(exerciseLog => {
          const newDate = new Date(exerciseLog.date);
          exerciseLog.date = newDate.toDateString();
        });
        console.log(doc);
        res.json(doc);
      }
    });
});


// Start the app
const port = ('PORT' in process.env) ? process.env.PORT : 3000;
const listener = app.listen(port, () => {
  console.log(`The app is listening on port ${port}.`)
});
