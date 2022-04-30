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

// Connect to MongoDB
const { ExerciseDAO } = require('./dao.js');
let edao = new ExerciseDAO();

// Utility function for validating input
function isInvalidString(str) {
  return (!str || str.trim().length === 0);
}

// Declare location of static assets
app.use(express.static('public'));

// Get main page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});


// Create new user.
// Responds with JSON containing username and _id.
app.post('/api/users', (req, res) => {
  if (isInvalidString(req.body.username)) {
    res.json({"error": "username missing"});
  }
  
  edao.createUser(req.body.username)
    .then((result) => {
      console.log(`\nUser created:`);
      console.log(result);
      res.json(result);
    })
    .catch((error) => {
      console.error(error);
    });
});


// Get an array containing all user information.
app.get('/api/users', (req, res) => {;
  edao.getAllUserInfo()
    .then((result) => {
      console.log('\nAll user info requested.');
      res.json(result);
    })
    .catch((error) => {
      console.error(error);
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
  // Validate input
  if (isInvalidString(req.params._id)) {
    res.json({"error": "userid missing"});
    return;
  }
  if (isInvalidString(req.body.description)) {
    res.json({"error": "description missing"});
    return;
  }
  if (isInvalidString(req.body.duration)) {
    res.json({"error": "duration missing"});
    return;
  }
  // User is allowed to not specify a date.
  // In that case, the current date will be used.
  const date = isInvalidString(req.body.date) ? null : req.body.date;
  
  edao.addExerciseToUser(
    req.params._id,
    req.body.description,
    req.body.duration,
    date
  )
    .then((result) => {
      console.log('\nExercise added:');
      console.log(result);
      res.json(result);
    })
    .catch((error) => {
      console.error(error);
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
app.get('/api/users/:_id/logs', (req, res) => {
  // Validate input
  if (isInvalidString(req.params._id)) {
    res.json({"error": "userid missing"});
    return;
  }
  
  // The following 3 parameters are optional:
  let from = isInvalidString(req.query.from) ? null : req.query.from;
  let to = isInvalidString(req.query.to) ? null : req.query.to;
  let limit = isInvalidString(req.query.limit) ? null : req.query.limit;
  
  edao.getExerciseLog(req.params._id, from, to, limit)
    .then((result) => {
      console.log('\nExercise log requested:');
      console.log(req.query);
      console.log(result);
      res.json(result);
    })
    .catch((error) => {
      console.error(error);
    });
});


// Start the app
const port = ('PORT' in process.env) ? process.env.PORT : 3000;
const server = app.listen(port, () => {
  console.log(`The app is listening on port ${port}.`)
});


// Also need to define response to 'SIGTERM'?
process.on('SIGINT', () => {
  // Close MongoDB connection
  edao.disconnect();
  // Shut down server
  server.close(() => {
    console.log('Server process terminated.');
  });
});
