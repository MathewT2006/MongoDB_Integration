// Step 2: Querying, updating, and deleting (CRUD)
// Run in mongosh after step 1:  load("queries/step2-crud.js")

const lab = db.getSiblingDB("firewall_lab");
const show = (label, value) => { print(`\n--- ${label} ---`); printjson(value); };

// ---------- READ: query filters and operators ----------

// AND: comma-separated conditions must all match
show("Denied TCP traffic", lab.events.find({ action: "deny", protocol: "TCP" }).toArray());

// $in: denied traffic to SSH (22) or RDP (3389)
show("Denied SSH or RDP ($in)", lab.events.find({ action: "deny", destPort: { $in: [22, 3389] } }).toArray());

// $lt: well-known ports (below 1024) only
show("Well-known ports ($lt)", lab.events.find({ destPort: { $lt: 1024 } }).toArray());

// $or + regex: anything denied, OR anything from the internal 10.x network
show("Denied OR internal ($or)", lab.events.find({ $or: [{ action: "deny" }, { sourceIp: /^10\./ }] }).toArray());

// $exists: documents that have a bytes field (flexible schema)
show("Has bytes field ($exists)", lab.events.find({ bytes: { $exists: true } }).toArray());

// Projection: return only sourceIp and destPort, hide _id
show("Projection", lab.events.find({ action: "deny" }, { sourceIp: 1, destPort: 1, _id: 0 }).toArray());

// Sort descending by port, top 2
show("Sort + limit", lab.events.find().sort({ destPort: -1 }).limit(2).toArray());

// ---------- UPDATE: always use an update operator ----------

// $set: add fields to one document
show("updateOne $set", lab.events.updateOne(
  { destPort: 3389 },
  { $set: { note: "Blocked by inbound RDP rule", severity: "high" } }
));

// Same $set again: matchedCount 1, modifiedCount 0 (value already set)
show("Same $set again (matched vs modified)", lab.events.updateOne(
  { destPort: 3389 },
  { $set: { severity: "high" } }
));

// updateMany: mark all denied events as reviewed
show("updateMany $set", lab.events.updateMany({ action: "deny" }, { $set: { reviewed: true } }));

// $inc: increment a number
show("updateOne $inc", lab.events.updateOne({ bytes: { $exists: true } }, { $inc: { bytes: 1000 } }));

// $unset: remove a field
show("updateOne $unset", lab.events.updateOne({ destPort: 3389 }, { $unset: { note: "" } }));

show("Events after updates", lab.events.find().toArray());

// ---------- DELETE ----------

// Insert a throwaway document, then delete it
lab.events.insertOne({ sourceIp: "0.0.0.0", action: "test" });
show("deleteOne", lab.events.deleteOne({ action: "test" }));

// Back to 4. Careful: deleteMany({}) with an empty filter would delete EVERYTHING.
show("Total events", lab.events.countDocuments());
