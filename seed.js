// seed.js — sample data for the Firewall Log Tracker project
// Run inside mongosh with:  load("seed.js")
// WARNING: this resets the devices and events collections in firewall_lab.

const lab = db.getSiblingDB("firewall_lab");

lab.devices.drop();
lab.events.drop();

// ---------- devices ----------
// Interfaces and tags are EMBEDDED: they belong to one device, are small,
// and are always read together with it.
const devices = [
  {
    _id: "dev-01", hostname: "desk-ana", type: "desktop", zone: "LAN",
    owner: "Ana", ip: "10.0.0.12",
    interfaces: [{ name: "eth0", mac: "00:1A:2B:3C:4D:01", ip: "10.0.0.12" }],
    tags: ["finance"]
  },
  {
    _id: "dev-02", hostname: "laptop-ben", type: "laptop", zone: "LAN",
    owner: "Ben", ip: "10.0.0.15",
    interfaces: [{ name: "wlan0", mac: "00:1A:2B:3C:4D:02", ip: "10.0.0.15" }],
    tags: ["remote", "sales"]
  },
  {
    _id: "dev-03", hostname: "web-srv", type: "server", zone: "DMZ",
    owner: "IT", ip: "172.16.0.10",
    interfaces: [
      { name: "eth0", mac: "00:1A:2B:3C:4D:03", ip: "172.16.0.10" },
      { name: "eth1", mac: "00:1A:2B:3C:4D:04", ip: "172.16.0.11" }
    ],
    tags: ["public", "critical"]
  },
  {
    _id: "dev-04", hostname: "laptop-cara", type: "laptop", zone: "LAN",
    owner: "Cara", ip: "10.0.0.21",
    interfaces: [{ name: "wlan0", mac: "00:1A:2B:3C:4D:05", ip: "10.0.0.21" }],
    tags: ["engineering"]
  }
];
lab.devices.insertMany(devices);

// ---------- helpers ----------
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomExternalIp = () =>
  pick(["203.0.113.", "198.51.100.", "192.0.2.", "93.184.216."]) + randInt(1, 254);
const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

const lanDevices = devices.filter(d => d.zone === "LAN");
const webServer = devices.find(d => d._id === "dev-03");
// A few "noisy" attackers so the top-attackers aggregation has a clear answer later
const attackers = ["203.0.113.5", "198.51.100.7", "192.0.2.44", "203.0.113.99", "198.51.100.200"];

// ---------- events ----------
// Each event REFERENCES a device by deviceId instead of being embedded in it:
// events are numerous and grow without limit, so embedding them would make
// device documents huge (MongoDB documents max out at 16 MB).
const events = [];
for (let i = 0; i < 5000; i++) {
  const timestamp = new Date(Date.now() - randInt(0, sevenDaysMs));
  const r = Math.random();

  if (r < 0.6) {
    // Outbound traffic from an internal endpoint — allowed
    const dev = pick(lanDevices);
    const destPort = pick([443, 443, 443, 80, 53]);
    events.push({
      timestamp, deviceId: dev._id,
      sourceIp: dev.ip, destIp: randomExternalIp(), destPort,
      protocol: destPort === 53 ? "UDP" : "TCP",
      action: "allow", direction: "outbound",
      bytes: randInt(200, 50000)
    });
  } else if (r < 0.75) {
    // Inbound HTTPS to the DMZ web server — allowed
    events.push({
      timestamp, deviceId: webServer._id,
      sourceIp: randomExternalIp(), destIp: webServer.ip, destPort: 443,
      protocol: "TCP", action: "allow", direction: "inbound",
      bytes: randInt(500, 80000)
    });
  } else {
    // Inbound remote-access attempts — denied (no bytes field: flexible schema)
    const target = pick(devices);
    events.push({
      timestamp, deviceId: target._id,
      sourceIp: Math.random() < 0.7 ? pick(attackers) : randomExternalIp(),
      destIp: target.ip, destPort: pick([22, 3389, 3389, 23, 445]),
      protocol: "TCP", action: "deny", direction: "inbound",
      rule: "deny-inbound-remote-access"
    });
  }
}
lab.events.insertMany(events);

print(`Inserted ${lab.devices.countDocuments()} devices and ${lab.events.countDocuments()} events into firewall_lab.`);
