# Firewall Log Tracker: Learning MongoDB

A small MongoDB project that stores and analyzes firewall log events for a simulated office network. It was built step by step to learn MongoDB fundamentals and demonstrate key concepts: documents and collections, CRUD operations, flexible schemas, and schema design (embedding vs. referencing).

The network matches a simple security architecture: internal LAN endpoints, a DMZ web server, and a firewall that allows or denies traffic between zones and the internet.

## Tools

| Tool | Purpose |
| --- | --- |
| MongoDB Atlas (free tier) | Cloud-hosted MongoDB database |
| mongosh | MongoDB's JavaScript command-line shell, used for all commands |
| `seed.js` | Script that generates the sample dataset |

## Setup

1. Created a free cluster in MongoDB Atlas.
2. Created a database user and added my IP address to the network access list. Atlas blocks all connections by default, so access must be explicitly allowed (a firewall allow-list).
3. Installed `mongosh` and connected using the connection string from **Connect → Shell**.
4. Switched to the project database:
   ```js
   use firewall_lab
   ```

---

## Step 1: Documents, collections, and flexible schema

**Concepts:** database, collection, document, `_id`, flexible schema.

| Term | Meaning | SQL equivalent |
| --- | --- | --- |
| Database | A container for collections (`firewall_lab`) | Database |
| Collection | A group of documents (`events`, `devices`) | Table |
| Document | A single JSON-like record | Row |

Databases and collections are created automatically the first time data is inserted.

```js
db.events.insertOne({
  timestamp: new Date(),
  sourceIp: "203.0.113.5",
  destPort: 3389,
  protocol: "TCP",
  action: "deny"
})

db.events.insertMany([
  { timestamp: new Date(), sourceIp: "10.0.0.12", destPort: 443, protocol: "TCP", action: "allow" },
  { timestamp: new Date(), sourceIp: "198.51.100.7", destPort: 22, protocol: "TCP", action: "deny" },
  { timestamp: new Date(), sourceIp: "10.0.0.15", destPort: 443, protocol: "TCP", action: "allow", bytes: 5120 }
])

db.events.find({ action: "deny" })
db.events.countDocuments()
```

**What this demonstrates:**
- MongoDB automatically adds a unique `_id` (an ObjectId) to every document that doesn't provide one.
- **Flexible schema:** the last document has a `bytes` field the others don't, and MongoDB accepts it. Documents in the same collection don't need identical fields.

---

## Step 2: Querying, updating, and deleting (CRUD)

**Concepts:** query filters, query operators, projection, sorting, update operators.

### Queries

```js
// AND: comma-separated conditions must all match
db.events.find({ action: "deny", protocol: "TCP" })

// $in: denied traffic to SSH (22) or RDP (3389)
db.events.find({ action: "deny", destPort: { $in: [22, 3389] } })

// $lt: well-known ports only
db.events.find({ destPort: { $lt: 1024 } })

// $or + regex: anything denied, or anything from the internal 10.x network
db.events.find({ $or: [{ action: "deny" }, { sourceIp: /^10\./ }] })

// $exists: documents that have a bytes field
db.events.find({ bytes: { $exists: true } })

// Projection: return only selected fields
db.events.find({ action: "deny" }, { sourceIp: 1, destPort: 1, _id: 0 })

// Sort descending and limit
db.events.find().sort({ destPort: -1 }).limit(2)
```

### Updates

```js
// $set: add or change fields on one document
db.events.updateOne(
  { destPort: 3389 },
  { $set: { note: "Blocked by inbound RDP rule", severity: "high" } }
)

// updateMany: mark all denied events as reviewed
db.events.updateMany({ action: "deny" }, { $set: { reviewed: true } })

// $inc: increment a number
db.events.updateOne({ bytes: { $exists: true } }, { $inc: { bytes: 1000 } })

// $unset: remove a field
db.events.updateOne({ destPort: 3389 }, { $unset: { note: "" } })
```

### Deletes

```js
db.events.insertOne({ sourceIp: "0.0.0.0", action: "test" })
db.events.deleteOne({ action: "test" })
```

**What this demonstrates:**
- Comma-separated conditions are combined with AND; `$or` is needed for OR across fields.
- Updates take a **filter** (which documents) and an **update operator** (what to change). Using an operator like `$set` matters: without one, an update can replace the entire document.
- `matchedCount` shows how many documents matched the filter; `modifiedCount` shows how many actually changed. Running the same `$set` twice gives a match but no modification, because the value is already set.
- `deleteMany({})` with an empty filter deletes every document, so filters must be written carefully.

---

## Step 3: Realistic data and schema design

**Concepts:** embedding, referencing, dot notation, array queries.

### Dataset

`seed.js` generates a dataset that models the office network. Run it from mongosh, started in the folder that contains the file:

```js
load("seed.js")
```

It resets and fills two collections:

| Collection | Documents | Contents |
| --- | --- | --- |
| `devices` | 4 | Two LAN laptops, one LAN desktop, one DMZ web server |
| `events` | 5,000 | Firewall events from the last 7 days |

The events follow realistic patterns:
- about 60% allowed outbound traffic from LAN endpoints (HTTPS, HTTP, DNS)
- about 15% allowed inbound HTTPS to the DMZ web server
- about 25% denied inbound remote-access attempts (SSH, RDP, Telnet, SMB), mostly from a small set of repeat attacker IPs

### Schema design decisions

**Embedded: device interfaces and tags.** Each device stores its network interfaces as an array inside the device document:

```js
{
  _id: "dev-03", hostname: "web-srv", type: "server", zone: "DMZ",
  interfaces: [
    { name: "eth0", mac: "00:1A:2B:3C:4D:03", ip: "172.16.0.10" },
    { name: "eth1", mac: "00:1A:2B:3C:4D:04", ip: "172.16.0.11" }
  ],
  tags: ["public", "critical"]
}
```

Embedding fits because interfaces belong to exactly one device, there are only a few per device, and they are almost always read together with the device. One read returns everything needed.

**Referenced: events point to devices.** Each event stores a `deviceId` instead of being stored inside its device:

```js
{
  timestamp: ISODate("..."), deviceId: "dev-03",
  sourceIp: "203.0.113.5", destIp: "172.16.0.10", destPort: 3389,
  protocol: "TCP", action: "deny", direction: "inbound",
  rule: "deny-inbound-remote-access"
}
```

Referencing fits because events are numerous and grow without limit. MongoDB documents have a 16 MB maximum, so a device document that embedded every log event would keep growing until it broke. Events are also usually queried on their own ("all denies today"), not through a device.

**Rule of thumb:** data that is read together is stored together, unless it grows without bound.

**Flexible schema in practice:** denied events have no `bytes` field (no data was transferred) and have a `rule` field; allowed events have `bytes` but no `rule`. Both live in the same collection.

### Queries on the new data

```js
// Dot notation: devices with a wireless interface
db.devices.find({ "interfaces.name": "wlan0" }, { hostname: 1 })

// Array match: devices tagged critical
db.devices.find({ tags: "critical" })

// Following a reference manually (two queries)
const ev = db.events.findOne({ action: "deny" })
db.devices.findOne({ _id: ev.deviceId })

// Counts on the full dataset
db.events.countDocuments({ action: "deny" })
db.events.countDocuments({ action: "deny", destPort: 3389 })

// Largest transfers
db.events.find({ bytes: { $gt: 45000 } }).sort({ bytes: -1 }).limit(5)
```

**What this demonstrates:**
- Dot notation (`"interfaces.name"`) queries fields inside embedded documents.
- Querying an array field with a single value matches any document whose array contains that value.
- Following a reference by hand takes two queries. The aggregation stage `$lookup` (Step 5) does it in one.

---

## Roadmap

- [x] Step 1: Documents, collections, flexible schema
- [x] Step 2: CRUD and query operators
- [x] Step 3: Realistic data and schema design
- [ ] Step 4: Indexes and `explain()` (before/after query performance)
- [ ] Step 5: Aggregation pipeline (top attacking IPs, denies over time, `$lookup`)
- [ ] Step 6: Schema validation with `$jsonSchema`
