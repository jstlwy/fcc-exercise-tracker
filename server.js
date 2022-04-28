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

// Connect to MongoDB and get handler to collection
import ExerciseDAO from './dao.js';
const { MongoClient, ObjectId } = require('mongodb');
const client = new MongoClient(process.env.DB_URI);
let exerciseCollection;
client.connect()
  .then(() => {
    ExerciseDAO.injectDB(client);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });


// Declare location of static assets
app.use(express.static('public'));


// Get main page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});


// Create new user.
// Responds with JSON containing username and _id.
app.post('/api/users', (req, res) => {
  ExerciseDAO.createUser(req.body.username);
  res.json();
});


// Get an array containing all user information.
app.get('/api/users', (req, res) => {;
  ExerciseDAO.getAllUserInfo();
  res.json();
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
  ExerciseDAO.addExerciseToUser(userId, desc, duration, date);
  res.json();
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
  ExerciseDAO.getExerciseLog(userId, from, to, limit);
  res.json();
});


// Start the app
const port = ('PORT' in process.env) ? process.env.PORT : 3000;
const listener = app.listen(port, () => {
  console.log(`The app is listening on port ${port}.`)
});


// Define shutdown behavior. Taken from:
// https://stackoverflow.com/a/63419186
function cleanup() {
  // Close MongoDB
  client.close();
  // Exit with default success code, 0
  //process.exit();
  console.log('Shutting down.\n');
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);