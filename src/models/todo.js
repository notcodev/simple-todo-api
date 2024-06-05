import mongoose from "mongoose";

const TodoSchema = new mongoose.Schema({
  text: { type: String, required: true },
  completed: { type: Boolean, default: false },
  sessionId: { type: String, required: true },
});

const Todo = mongoose.model("Todo", TodoSchema);

export default Todo;
