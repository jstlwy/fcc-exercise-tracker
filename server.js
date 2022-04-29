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


// Declare location of static assets
app.use(express.static('public'));


// Get main page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});


// Create new user.
// Responds with JSON containing username and _id.
app.post('/api/users', (req, res) => {
  let uname = req.body.username;
  if (!uname || uname.trim().length === 0) {
    res.json({"error": "username missing"});
  }
  
  edao.createUser(uname)
    .then((result) => {
      console.log(`\nUser created:`);
      console.log(result);
      res.json(result);
    });
});


// Get an array containing all user information.
app.get('/api/users', (req, res) => {;
  edao.getAllUserInfo()
    .then((result) => {
      console.log('\nAll user info requested.');
      res.json(result);
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
  let id = req.params._id;
  if (!id || id.trim().length === 0) {
    res.json({"error": "userid missing"});
    return;
  }
  let description = req.body.description;
  if (!description || description.trim().length === 0) {
    res.json({"error": "description missing"});
    return;
  }
  let duration = req.body.duration;
  if (!duration || duration.trim().length === 0) {
    res.json({"error": "duration missing"});
    return;
  }
  let date = req.body.date;
  if (!date || date.trim().length === 0) {
    res.json({"error": "date missing"});
    return;
  }
  
  const result = edao.addExerciseToUser(
    id, description, duration, date
  ).then((result) => {
    console.log('\nExercise added:');
    console.log(result);
    res.json(result);
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
  if (!req.params._id) {
    res.json({"error": "userid missing"});
    return;
  }
  
  // The following 3 parameters are optional:
  let from = req.query.from;
  if (!from || from.trim().length === 0) {
    from = null;
  }
  let to = req.query.to;
  if (!to || to.trim().length === 0) {
    to = null;
  }
  let limit = req.query.limit;
  if (!limit || limit.trim().length === 0) {
    limit = null;
  }
  
  edao.getExerciseLog(req.params._id, from, to, limit)
    .then((result) => {
      console.log('\nExercise log requested:');
      console.log(req.query);
      console.log(result);
      res.json(result);
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
