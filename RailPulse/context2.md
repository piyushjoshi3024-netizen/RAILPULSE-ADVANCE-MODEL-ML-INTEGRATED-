# RailPulse Backend Context

## Project
RailPulse is an SIH railway intelligence prototype focused on
dynamic train ETA and railway traffic-flow intelligence.

## Current Backend
Node.js + Express

## Database
MongoDB

## Cache / Live State
Redis

## Realtime
Socket.IO

## Roles
PASSENGER          
STAFF
ADMIN

## Backend Domains
Auth
Trains
ETA
Journey
Simulation / What-If
Operations
Alerts

## Operations
Network
Risk
Bottleneck
Propagation
Recovery

## Architecture

Request
→ Route
→ Controller
→ Service
→ Model / Redis / Operations
→ Response

## Important
- One main Node/Express backend.
- Do not create microservices.
- Do not create separate Passenger/Staff/Admin backends.
- Do not create Python/FastAPI/ML service yet.
- Existing prediction TypeScript full-stack application is separate.
- Do not modify prediction-app.
- Use mock data only where necessary during early integration.
- Frontend communicates with this backend, not directly with databases.
- Build incrementally.




Read CONTEXT.md.

Implement the Train MongoDB model.

Create only:
backend/src/models/Train.js

Fields:
- trainNumber
- trainName
- trainType
- source
- destination
- route
- status

Use Mongoose.

Do not create routes, controllers, services or other models.

Do not modify existing files unless absolutely required.

Return only:
- changed file
- short explanation
- test approach



User
  │
  └── authentication

Train
  ↓
TrainEvent
  ↓
ETAPrediction
  ↓
Risk / Bottleneck / Propagation
  ↓
Alert

Journey
  ↓
Simulation

1. User
2. Train
3. TrainEvent
4. ETAPrediction
5. Journey
6. Simulation
7. Alert


Read CONTEXT.md.

Create ONLY:

backend/src/models/User.js

Create a Mongoose User schema with:

- name: required String
- email: required String, unique, lowercase
- password: required String
- role: enum ["PASSENGER", "STAFF", "ADMIN"], default "PASSENGER"
- isActive: Boolean, default true
- timestamps: true

Do not create routes.
Do not create controllers.
Do not create services.
Do not create Staff.js or Admin.js.
Do not modify unrelated files.
Do not install packages.

Keep it minimal.



Instead:

User.js
   │
   └── role: "STAFF"

A staff member is simply:

{
    "name": "Control Room User",
    "email": "staff@railpulse.com",
    "password": "hashed-password",
    "role": "STAFF",
    "isActive": true
}

Then later:

POST /api/auth/login
       ↓
User
       ↓
role = STAFF
       ↓
JWT
       ↓
rbac.js
       ↓
Staff routes

That's your Staff system.

What Staff can eventually access
STAFF
 │
 ├── Train monitoring
 ├── ETA intelligence
 ├── Network
 ├── Risk
 ├── Bottleneck
 ├── Propagation
 ├── Recovery
 ├── Simulation
 └── Alerts

This matches your product's role-based design: staff gets the Operations Command Center and the analytical railway workflows.

So there is no Staff model to create at this stage.

Phase 3 — Train.js

Now create:

backend/
└── src/
    └── models/
        ├── User.js
        └── Train.js
Train data model

Keep the first version simple:

Train
│
├── trainNumber
├── trainName
├── trainType
├── source
├── destination
├── route
├── status
├── currentStation
└── isActive
Suggested schema
{
    trainNumber: String,
    trainName: String,
    trainType: String,
    source: String,
    destination: String,

    route: [
        {
            station: String,
            sequence: Number,
            scheduledArrival: String,
            scheduledDeparture: String
        }
    ],

    status: String,
    currentStation: String,
    isActive: Boolean,

    timestamps: true
}

For trainType, you can use:

EXPRESS
SUPERFAST
PASSENGER
FREIGHT
SPECIAL

For status:

RUNNING
DELAYED
AT_STATION
CANCELLED
COMPLETED



Phase 1 — User.js

Start here.

backend/
└── src/
    └── models/
        └── User.js
User data model
User
│
├── name
├── email
├── password
├── role
├── isActive
├── createdAt
└── updatedAt
Schema
{
    name: String,
    email: String,
    password: String,
    role: {
        type: String,
        enum: ["PASSENGER", "STAFF", "ADMIN"],
        default: "PASSENGER"
    },
    isActive: Boolean,
    timestamps: true
}




STEP 5 — Build Train API before everything else

Once Train.js works:

routes/
└── train.routes.js

controllers/
└── train.controller.js

services/
└── train.service.js



STEP 6 — Train events

Now:

Train
   ↓
TrainEvent

Build:

trainEvent model
trainEvent service
trainEvent controller
trainEvent route

The event should contain things such as:

trainId
eventType
location
speed
delayMinutes
section
timestamp

This is the data that eventually drives live train state and ETA.



You should get something conceptually like:

TrainEvent
├── trainId
├── eventType
├── location
│   ├── lat
│   └── lng
├── speed
├── delayMinutes
├── section
├── currentStation
├── timestamp
├── createdAt
└── updatedAt


Train
_id
 │
 │ reference
 ▼
TrainEvent
trainId

Your existing train:

12951 Mumbai Rajdhani
_id = 6a9d5a64a663314c1afeaa69




TEP 1 — Create TrainEvent.js

Go to:

backend/
└── src/
    └── models/

Create:

TrainEvent.js

Your structure temporarily:

models/
├── User.js
├── Train.js
└── TrainEvent.js   ← NEW



const trainEventSchema = new mongoose.Schema(
  {
    trainId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Train",
      required: true
    },

    eventType: {
      type: String,
      required: true
    },

    location: {
      lat: Number,
      lng: Number
    },

    speed: {
      type: Number,
      default: 0
    },

    delayMinutes: {
      type: Number,
      default: 0
    },

    section: String,

    currentStation: String,

    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);


Create TrainEvent API

Now create:

src/
├── models/
│   └── TrainEvent.js
│
├── routes/
│   └── trainEvent.routes.js
│
├── controllers/
│   └── trainEvent.controller.js
│
└── services/
    └── trainEvent.service.js




    Now we move to the next layer: Redis for live/current train state.

Where we are
Train
  ↓
TrainEvent
  ↓
MongoDB

MongoDB is our historical/event storage.

We now need:

TrainEvent
     ↓
   Redis
     ↓
Current Live Train State

Why? Because RailPulse needs to repeatedly answer things like:

“Where is train 12951 RIGHT NOW?”

Redis is much better suited for this frequently changing state than querying MongoDB every time.


.env

Your backend .env should eventually contain:

MONGO_URI=your_mongodb_connection
PORT=5000
REDIS_URL=redis://localhost:6379


Your 12951 now has the minimum information required for a basic ETA engine.

Current state
12951 Mumbai Rajdhani
│
├── Current station: Surat
├── Status: DELAYED
│
├── LiveState
│   ├── speed: 72 km/h
│   ├── delay: 8 min
│   └── location: Surat
│
└── Route
    ├── Mumbai Central
    ├── Surat             ← CURRENT
    ├── Bharuch
    ├── Vadodara
    ├── Ratlam
    ├── Kota
    └── New Delhi         ← D


    NOW: Build ETA

Before writing the ETA logic, we need one model.

Create:

backend/src/models/ETAPrediction.js

Train
  ↓
TrainEvent
  ↓
LiveState
  ↓
Route + Schedule
  ↓
┌──────────────────────┐
│  ETAPrediction       │
│  data model          │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│  ETA Service         │
│  calculation logic   │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│  ETA Controller      │
└──────────┬───────────┘
           ↓
┌──────────────────────┐
│  ETA Route / API     │
└──────────┬───────────┘
           ↓
      Thunder Client



      Controller
     ↓
ETA Service
     ↓
Train + LiveState + Route
     ↓
ETA calculation
     ↓
ETAPrediction



LiveState
├── currentStation
├── speed
├── delayMinutes
└── timestamp

Train
├── route
└── destination

Calculation concept:

remaining route distance
          ÷
     current speed
          +
   current delay
          ↓
   predicted ETA


   ETA API

Only after the service works, create the API.

We'll have:

GET /api/trains/:id/eta

Flow:

Thunder Client
      ↓
GET /api/trains/:id/eta
      ↓
eta.routes.js
      ↓
eta.controller.js
      ↓
eta.service.js
      ↓
MongoDB + LiveState
      ↓
ETAPrediction
      ↓
JSON response



Create RiskAssessment.js

Create:

backend/src/models/RiskAssessment.js

# NEXT: Risk Module

Now we move to the next layer:

ETA
 ↓
RISK

The purpose is to answer:

"How dangerous is the current train situation?"

For RailPulse, Risk should eventually consider things like:

Current delay
ETA deviation
Train speed
Congestion
Track/section conditions
Propagation potential

But don't build all of that now.

We'll start with a simple Risk v1 based on the ETA prediction.


Now we build the Risk Service — this is where the actual risk calculation happens.


## Risk Service

File:

```text
backend/src/services/risk.service.js


Create risk.controller.js

Create:

backend/src/controllers/risk.controller.js


es. After bottleneck.service.js, the next step is to expose it as an API.

What will you get?

For your current train:

Train: 12951
Current station: Surat
Next station: Bharuch
Current delay: 409 min

The Bottleneck module will produce something like:

{
  "trainId": "6a9d5a64a663314c1afeaa69",
  "station": "Surat",
  "section": "Surat → Bharuch",
  "severity": "HIGH",
  "score": 85,
  "reason": "Severe delay",
  "detectedAt": "2026-09-06T..."
}

So RailPulse will now be able to say:

Train 12951 has a HIGH bottleneck risk around the Surat → Bharuch section.


