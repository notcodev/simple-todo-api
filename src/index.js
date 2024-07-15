import express from "express";
import mongoose from "mongoose";
import session from "express-session";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import connectMongoDBSession from "connect-mongodb-session";
import { z } from "zod";
import nodeCron from "node-cron";
import { Todo } from "./models/todo.js";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

dotenv.config();

const { DATABASE_URL, IS_DEV, SESSION_SECRET } = process.env;

mongoose.connect(DATABASE_URL);

const app = express();
const HOSTNAME = IS_DEV.trim() === "true" ? "localhost" : "0.0.0.0";
const PORT = 3010;

const MongoDBStore = connectMongoDBSession(session);
const store = new MongoDBStore({
  uri: DATABASE_URL,
  collection: "sessions",
}).on("error", function (error) {
  console.error(error);
});

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Todo List API",
      version: "1.0.0",
      description: "A simple Express Todo List API",
    },
    servers: [
      {
        url: `http://${HOSTNAME}:${PORT}`,
      },
    ],
  },
  apis: ["./src/index.js"],
};

const specs = swaggerJsdoc(options);

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

const createTodoDtoSchema = z.object({
  text: z.string().min(1, "Text cannot be empty"),
  completed: z.boolean().optional(),
});

const todoDtoSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1),
  completed: z.boolean().optional(),
});

const patchTodoDtoSchema = z
  .object({
    text: z.string().min(1, "Text cannot be empty"),
    completed: z.boolean(),
  })
  .partial();

/**
 * @swagger
 * components:
 *   schemas:
 *     TodoDto:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated id of the todo
 *         text:
 *           type: string
 *           description: The text of the todo
 *         completed:
 *           type: boolean
 *           description: The completion status of the todo
 *       example:
 *         id: d5fE_asz
 *         text: Buy groceries
 *         completed: false
 *     CreateTodoDto:
 *       type: object
 *       required:
 *         - text
 *       properties:
 *         text:
 *           type: string
 *           description: The text of the todo
 *         completed:
 *           type: boolean
 *           description: The completion status of the todo
 *       example:
 *         text: Buy groceries
 *         completed: false
 *     PatchTodoDto:
 *       type: object
 *       properties:
 *         text:
 *           type: string
 *           description: The text of the todo
 *         completed:
 *           type: boolean
 *           description: The completion status of the todo
 *       example:
 *         text: Buy groceries
 *         completed: false
 */

/**
 * @swagger
 * tags:
 *   name: Todos
 *   description: The todos managing API
 */

/**
 * @swagger
 * /api/todos:
 *   get:
 *     summary: Returns the list of all the todos
 *     tags: [Todos]
 *     responses:
 *       200:
 *         description: The list of the todos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  ok:
 *                    type: boolean
 *                    description: Boolean status of the response
 *                    example: true
 *                  result:
 *                    type: array
 *                    items:
 *                      $ref: '#/components/schemas/TodoDto'
 */
app.get("/api/todos", async (req, res) => {
  if (!req.session.id) {
    return res.json({ ok: true, result: [] });
  }

  const todos = await Todo.find({ sessionId: req.session.id });
  res.json({
    ok: true,
    result: todos.map((todo) => todoDtoSchema.parse(todo)),
  });
});

/**
 * @swagger
 * /api/todos:
 *   post:
 *     summary: Create a new todo
 *     tags: [Todos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTodoDto'
 *     responses:
 *       200:
 *         description: The created todo.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  ok:
 *                    type: boolean
 *                    description: Boolean status of the response
 *                    example: true
 *                  result:
 *                    $ref: '#/components/schemas/TodoDto'
 *       400:
 *         description: Invalid input
 */
app.post("/api/todos", async (req, res) => {
  try {
    const todoData = createTodoDtoSchema.parse(req.body);

    const todo = new Todo({
      ...todoData,
      sessionId: req.sessionID,
    });

    await todo.save();
    res.json({ ok: true, result: todoDtoSchema.parse(todo) });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.errors });
  }
});

/**
 * @swagger
 * /api/todos/{id}:
 *   patch:
 *     summary: Update a todo
 *     tags: [Todos]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The todo id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PatchTodoDto'
 *     responses:
 *       200:
 *         description: The updated todo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  ok:
 *                    type: boolean
 *                    description: Boolean status of the response
 *                    example: true
 *                  result:
 *                    type: array
 *                    items:
 *                      $ref: '#/components/schemas/TodoDto'
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Todo not found
 */
app.patch("/api/todos/:id", async (req, res) => {
  try {
    const todoData = patchTodoDtoSchema.parse(req.body);

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

/**
 * @swagger
 * /api/todos/{id}:
 *   delete:
 *     summary: Remove a todo
 *     tags: [Todos]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The todo id
 *     responses:
 *       200:
 *         description: The todo was deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  ok:
 *                    type: boolean
 *                    description: Boolean status of the response
 *                    example: true
 *       404:
 *         description: Todo not found
 */
app.delete("/api/todos/:id", async (req, res) => {
  const { id } = req.params;

  const todo = await Todo.findOneAndDelete({
    _id: id,
    sessionId: req.session.id,
  });

  if (!todo) {
    return res.status(404).send({ ok: false, error: "not_found" });
  }

  res.json({ ok: true });
});

app.use("/api/documentation", swaggerUi.serve, swaggerUi.setup(specs));

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
  return new Promise((res, rej) => {
    store.all((err, obj) => (err ? rej(err) : res(obj)));
  });
}

app.listen(PORT, HOSTNAME, () => {
  console.log(`Server is running on http://${HOSTNAME}:${PORT}`);
});
