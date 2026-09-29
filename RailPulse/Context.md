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


. Never redesign the architecture.
2. Never create unnecessary files.
3. Never create microservices.
4. Never install libraries without necessity.
5. Never modify unrelated files.
6. Reuse existing code.
7. Controllers remain thin.
8. Business logic belongs in services/operations.
9. Database logic belongs behind services.
10. MongoDB = persistent data.
11. Redis = current/live state.
12. Socket.IO = realtime communication.
13. Prediction application remains separate.
14. Do not create Python/FastAPI yet.
15. Every feature must be tested before the next feature.
16. Do not rewrite working code just for style.


# order to keep in mind
1. Express foundation
2. MongoDB
3. Train model
4. Train CRUD
5. TrainEvent
6. Redis
7. ETA
8. Risk
9. Bottleneck
10. Propagation
11. Recovery
12. Simulation
13. Alerts
14. Auth/RBAC
15. Socket.IO
16. Frontend integration
17. Prediction-app integration




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


Phase 2 — Staff

Here's the important part:

DON'T create Staff.js

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