import express from "express";
import mongoose from "mongoose";
import session from "express-session";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import connectMongoDBSession from "connect-mongodb-session";
import { z } from "zod";
import nodeCron from "node-cron";
import Todo from "./models/todo.js";

dotenv.config();

const { DATABASE_URL, IS_DEV, SESSION_SECRET } = process.env;

mongoose.connect(DATABASE_URL);

const app = express();
const HOSTNAME = IS_DEV.trim() === "true" ? "localhost" : "0.0.0.0";
const PORT = 3000;

const MongoDBStore = connectMongoDBSession(session);
const store = new MongoDBStore({
  uri: DATABASE_URL,
  collection: "sessions",
});

store.on("error", function (error) {
  console.error(error);
});

app.use(bodyParser.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    store: store,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 },
  }),
);

const todoSchema = z.object({
  text: z.string().min(1, "Text is required"),
  completed: z.boolean().optional(),
});

app.get("/api/todos", async (req, res) => {
  if (!req.session.id) {
    return res.json({ ok: true, result: [] });
  }

  const todos = await Todo.find({ sessionId: req.session.id });
  res.json({ ok: true, result: todos });
});

app.post("/api/todos", async (req, res) => {
  try {
    const todoData = todoSchema.parse(req.body);

    const todo = new Todo({
      ...todoData,
      sessionId: req.sessionID,
    });

    await todo.save();
    res.json({ ok: true, result: todo });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.errors });
  }
});

app.patch("/api/todos/:id", async (req, res) => {
  try {
    const todoData = todoSchema.partial().parse(req.body); // Allow partial updates

    const todo = await Todo.findOneAndUpdate(
      { _id: req.params.id, sessionId: req.sessionID },
      todoData,
      { new: true },
    );

    if (!todo) {
      return res.status(404).send({ ok: false, error: "not_found" });
    }

    res.json({ ok: true, result: todo });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.errors });
  }
});

app.delete("/api/todos/:id", async (req, res) => {
  const { id } = req.params;

  const todo = await Todo.findOneAndDelete({
    _id: id,
    sessionId: req.session.id,
  });

  if (!todo) {
    return res.status(404).send({ ok: false, error: "not_found" });
  }

  res.json({ ok: true, result: null });
});

nodeCron.schedule("0 * * * *", async () => {
  try {
    const sessions = await getAllSessions();

    const now = new Date();
    const expiredSessionIds = Object.values(sessions)
      .filter((session) => {
        const expiryDate = new Date(session.expires);
        return expiryDate.getTime() < now.getTime();
      })
      .map((session) => session._id);

    await Promise.all(
      expiredSessionIds.map((sessionId) =>
        store.destroy(sessionId).then(Todo.deleteMany({ sessionId })),
      ),
    );

    console.log(
      `Cleaned up ${expiredSessionIds.length} expired sessions and their todos.`,
    );
  } catch (error) {
    console.error("Error cleaning up expired sessions:", error);
  }
});

function getAllSessions() {
  return Promise((res, rej) => {
    store.all((err, obj) => (err ? rej(err) : res(obj)));
  });
}

app.listen(PORT, HOSTNAME, () => {
  console.log(`Server is running on http://${HOSTNAME}:${PORT}`);
});
