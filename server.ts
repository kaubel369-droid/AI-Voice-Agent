import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("voxbiz.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    date TEXT,
    time TEXT,
    service TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS callbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/records", (req, res) => {
    try {
      const appointments = db.prepare("SELECT * FROM appointments ORDER BY created_at DESC").all();
      const callbacks = db.prepare("SELECT * FROM callbacks ORDER BY created_at DESC").all();
      res.json({ appointments, callbacks });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch records" });
    }
  });

  app.post("/api/appointments", (req, res) => {
    const { name, date, time, service } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO appointments (name, date, time, service) VALUES (?, ?, ?, ?)");
      stmt.run(name, date, time, service);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to book appointment" });
    }
  });

  app.post("/api/callbacks", (req, res) => {
    const { name, phone, reason } = req.body;
    try {
      const stmt = db.prepare("INSERT INTO callbacks (name, phone, reason) VALUES (?, ?, ?)");
      stmt.run(name, phone, reason);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to request callback" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
