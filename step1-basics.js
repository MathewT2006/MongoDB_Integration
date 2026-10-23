// Step 1: Documents, collections, and flexible schema
// Run in mongosh:  load("queries/step1-basics.js")
// Run order for the project: step1 -> step2 -> seed.js -> step3
// NOTE: this script resets the events collection so it starts from a clean slate.

const lab = db.getSiblingDB("firewall_lab");
const show = (label, value) => { print(`\n--- ${label} ---`); printjson(value); };

lab.events.drop();

// insertOne: the database and collection are created automatically on first insert.
// MongoDB adds a unique _id (ObjectId) because we don't provide one.
show("insertOne result", lab.events.insertOne({
  timestamp: new Date(),
  sourceIp: "203.0.113.5",
  destPort: 3389,
  protocol: "TCP",
  action: "deny"
}));

// insertMany: several documents at once.
// Flexible schema: the last document has a bytes field the others don't, and MongoDB accepts it.
show("insertMany result", lab.events.insertMany([
  { timestamp: new Date(), sourceIp: "10.0.0.12", destPort: 443, protocol: "TCP", action: "allow" },
  { timestamp: new Date(), sourceIp: "198.51.100.7", destPort: 22, protocol: "TCP", action: "deny" },
  { timestamp: new Date(), sourceIp: "10.0.0.15", destPort: 443, protocol: "TCP", action: "allow", bytes: 5120 }
]));

// find with no filter: every document in the collection
show("All events", lab.events.find().toArray());

// find with a filter: only denied traffic
show("Denied events", lab.events.find({ action: "deny" }).toArray());

// countDocuments: should be 4
show("Total events", lab.events.countDocuments());
