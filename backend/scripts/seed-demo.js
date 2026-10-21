#!/usr/bin/env node
/**
 * Fill the demo collections, printing the plan before writing anything.
 *
 *   node scripts/seed-demo.js                  # dry run: writes nothing
 *   node scripts/seed-demo.js --apply          # writes
 *   node scripts/seed-demo.js --apply --reset  # deletes dataSource:"SEED" rows first
 *
 * Deliberate properties:
 *
 *  - Dry run is the default. `--apply` is the only thing that writes, and the
 *    dry run reports the same counts the apply would produce, so the plan can
 *    be read before anything changes.
 *  - It touches five collections and names them explicitly. It never opens
 *    `users`, `main_users`, `live_train_state`, `reference_trains`,
 *    `predictions` or FastAPI's `alerts`: identity and ML data are not demo
 *    data, and a seed script is the wrong place to create an account.
 *  - Every document carries `dataSource: "SEED"`, and `--reset` deletes by
 *    that marker only, so anything entered by hand survives a reseed.
 *  - Upserts are keyed on a natural key (station code, corridor id, train
 *    number), so running it twice changes nothing the second time.
 */

const path = require("path");
const mongoose = require("mongoose");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const connectDB = require("../src/config/db");
const Station = require("../src/models/Station");
const Corridor = require("../src/models/Corridor");
const Train = require("../src/models/Train");
const TrainEvent = require("../src/models/TrainEvent");
const Alert = require("../src/models/Alert");
const redisClient = require("../src/config/redis");
const { updateTrainState } = require("../src/services/liveState.service");

const reference = require("../data/seed-reference.json");
const demo = require("../data/seed-demo-trains.json");

const APPLY = process.argv.includes("--apply");
const RESET = process.argv.includes("--reset");
const SEED = { dataSource: "SEED" };

/** The complete list of collections this script is allowed to write. */
const TOUCHED = ["main_stations", "main_corridors", "trains", "trainevents", "main_alerts"];

/**
 * Redis keys the live-state step writes, one per seeded train.
 *
 * `GET /api/trains/:id/eta` reads the train's live state from Redis, not from
 * Mongo. Without it every seeded train answered 404 "Live state not found",
 * which made the ETA page unusable on a freshly seeded database.
 */
const LIVE_STATE_KEYS = "train:live:<train _id>  (Redis, one per seeded train)";

const log = (...parts) => console.log(...parts);

/**
 * Validate the seed files against each other before touching the database.
 *
 * A corridor naming a station that does not exist, or an alert naming a train
 * that does not exist, would write a row that renders as a blank. It is caught
 * here instead of being discovered on the map.
 */
const validate = () => {
    const problems = [];
    const codes = new Set(reference.stations.map((s) => s.code));
    const numbers = new Set(demo.trains.map((t) => t.trainNumber));

    reference.corridors.forEach((corridor) => {
        corridor.stations
            .filter((code) => !codes.has(code))
            .forEach((code) =>
                problems.push(`corridor ${corridor.corridorId} names unknown station ${code}`)
            );
    });

    demo.trains
        .filter((train) => train.station && !codes.has(train.station))
        .forEach((train) =>
            problems.push(`train ${train.trainNumber} names unknown station ${train.station}`)
        );

    demo.alerts
        .filter((alert) => !numbers.has(alert.trainNumber))
        .forEach((alert) => problems.push(`alert names unknown train ${alert.trainNumber}`));

    return problems;
};

/** Upsert one batch and report what changed, or what would have. */
const sync = async (label, Model, rows, keyOf) => {
    const before = await Model.countDocuments();
    let inserts = 0;
    let updates = 0;

    for (const row of rows) {
        const key = keyOf(row);
        const existing = await Model.findOne(key).select("_id").lean();

        if (existing) updates += 1;
        else inserts += 1;

        if (APPLY) {
            await Model.updateOne(key, { $set: { ...row, ...SEED } }, { upsert: true });
        }
    }

    const after = APPLY ? await Model.countDocuments() : before + inserts;
    log(
        `  ${label.padEnd(16)} existing ${String(before).padStart(4)}` +
        `  insert ${String(inserts).padStart(4)}` +
        `  update ${String(updates).padStart(4)}` +
        `  final ${String(after).padStart(4)}`
    );
};

const run = async () => {
    const problems = validate();

    if (problems.length) {
        console.error("Seed data is inconsistent; nothing was attempted:");
        problems.forEach((problem) => console.error(`  - ${problem}`));
        process.exitCode = 1;
        return;
    }

    await connectDB();
    const dbName = mongoose.connection.name;

    log("");
    log(APPLY ? "APPLYING the demo seed" : "DRY RUN -- nothing will be written");
    log(`  database        ${dbName}`);
    log(`  collections     ${TOUCHED.join(", ")}`);
    log(`  redis keys      ${LIVE_STATE_KEYS}`);
    log(`  never touched   users, main_users, live_train_state, reference_trains, predictions, alerts`);
    log("");

    if (RESET) {
        const targets = [
            ["main_stations", Station],
            ["main_corridors", Corridor],
            ["trains", Train],
            ["main_alerts", Alert],
        ];

        for (const [label, Model] of targets) {
            const doomed = await Model.countDocuments(SEED);
            log(`  reset ${label.padEnd(16)} would delete ${doomed} seeded row(s)`);
            if (APPLY) await Model.deleteMany(SEED);
        }

        // TrainEvent has no dataSource field in its schema, so seeded events are
        // identified by the trains they belong to rather than by a marker.
        const seededTrains = await Train.find(SEED).select("_id").lean();
        const eventFilter = { trainId: { $in: seededTrains.map((t) => t._id) } };
        const doomedEvents = await TrainEvent.countDocuments(eventFilter);
        log(`  reset ${"trainevents".padEnd(16)} would delete ${doomedEvents} event(s) of seeded trains`);
        if (APPLY) await TrainEvent.deleteMany(eventFilter);
        log("");
    }

    log("Static reference data (stations and corridors do not change while trains run):");
    await sync("main_stations", Station, reference.stations, (row) => ({ code: row.code }));
    await sync("main_corridors", Corridor, reference.corridors, (row) => ({
        corridorId: row.corridorId,
    }));

    log("");
    log("Demo operational data:");
    await sync(
        "trains",
        Train,
        demo.trains.map((train) => ({
            trainNumber: train.trainNumber,
            trainName: train.trainName,
            trainType: train.trainType,
            source: train.source,
            destination: train.destination,
            status: train.delayMinutes > 0 ? "DELAYED" : "RUNNING",
            isActive: true,
            currentStation: train.source,
            // Two stops, not an invented stop sequence. The ETA endpoint sums
            // `distanceFromPrevious` from the current station to the
            // destination and needs a `scheduledArrival` there; both values
            // are the dataset's own. The dataset has no intermediate stops, so
            // none are written.
            route: [
                {
                    station: train.source,
                    sequence: 1,
                    distanceFromPrevious: 0,
                    scheduledArrival: "",
                },
                {
                    station: train.destination,
                    sequence: 2,
                    distanceFromPrevious: train.distanceKm,
                    scheduledArrival: train.scheduledArrival,
                },
            ],
        })),
        (row) => ({ trainNumber: row.trainNumber })
    );

    // One event per train, which is what the dashboard's "latest event" join
    // reads. `station` must be the seeded station's *name*, because that join
    // is by name; `location` carries the code. Where this repository has no
    // coordinate for a train's route at all, both fall back to the train's
    // real source from the ML dataset: the station is named honestly and
    // simply resolves to no marker, rather than being given a guessed point.
    const stationName = new Map(reference.stations.map((s) => [s.code, s.name]));
    const trainIds = new Map(
        (await Train.find().select("_id trainNumber").lean()).map((t) => [t.trainNumber, t._id])
    );

    const events = demo.trains
        .filter((train) => trainIds.has(train.trainNumber))
        .map((train) => ({
            trainId: trainIds.get(train.trainNumber),
            station: train.station ? stationName.get(train.station) : train.source,
            location: train.station || train.source,
            speed: train.delayMinutes > 30 ? 45 : 82,
            delayMinutes: train.delayMinutes,
            eventType: train.delayMinutes > 0 ? "DELAY_UPDATE" : "LOCATION_UPDATE",
            timestamp: new Date(),
        }));

    if (!APPLY && events.length !== demo.trains.length) {
        log(
            `  (dry run: ${demo.trains.length - events.length} train(s) are not in the database yet,` +
            " so their events are planned for the apply run, not counted here)"
        );
    }

    await sync("trainevents", TrainEvent, events, (row) => ({ trainId: row.trainId }));

    const alerts = demo.alerts
        .filter((alert) => trainIds.has(alert.trainNumber))
        .map((alert) => ({
            trainId: trainIds.get(alert.trainNumber),
            alertType: alert.alertType,
            severity: alert.severity,
            message: alert.message,
            affectedSection: alert.affectedSection,
        }));

    await sync("main_alerts", Alert, alerts, (row) => ({
        trainId: row.trainId,
        alertType: row.alertType,
    }));

    // ---------------------------------------------------------------- Redis
    //
    // The ETA endpoint reads a train's live state from Redis. Seeding Mongo
    // alone left every seeded train answering 404 there, so the ETA page could
    // not be used at all on a fresh database.
    log("");
    log("Live state (Redis, read by GET /api/trains/:id/eta):");

    const liveTrains = await Train.find(SEED).select("_id trainNumber").lean();
    const bySeedNumber = new Map(demo.trains.map((t) => [t.trainNumber, t]));
    let liveWritten = 0;

    for (const train of liveTrains) {
        const spec = bySeedNumber.get(train.trainNumber);
        if (!spec) continue;

        const state = {
            currentStation: spec.source,
            // Above zero, because the rule-based estimate divides by it.
            speed: spec.delayMinutes > 30 ? 45 : 82,
            delayMinutes: spec.delayMinutes,
            timestamp: new Date().toISOString(),
        };

        if (APPLY) await updateTrainState(String(train._id), state);
        liveWritten += 1;
    }

    log(`  ${"train:live:*".padEnd(16)} ${APPLY ? "wrote" : "would write"} ${liveWritten} key(s)`);

    if (!APPLY && liveWritten < demo.trains.length) {
        log(
            `  (dry run: a live-state key is keyed on a train's _id, and ` +
            `${demo.trains.length - liveWritten} train(s) are not in the database yet, ` +
            "so those keys are planned for the apply run and cannot be counted here)"
        );
    }

    const positionable = demo.trains.filter((t) => t.station).length;
    log("");
    log(
        `Map coverage: ${positionable} of ${demo.trains.length} demo trains sit at a station this` +
        " repository has a coordinate for. The rest appear in lists only."
    );
    log(APPLY ? "Done. The database was written." : "Dry run complete. Nothing was written.");
};

run()
    .catch((error) => {
        console.error("Seed failed:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.connection.close().catch(() => {});
        await redisClient.quit().catch(() => {});
    });
