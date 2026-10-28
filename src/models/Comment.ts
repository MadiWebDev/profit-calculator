import mongoose, { Schema, Document, model, models } from "mongoose";

/** Collaboration (F1.11): comments/notes on orders, products, campaigns. */
export interface IComment extends Document {
  teamId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  targetType: "order" | "product" | "campaign" | "report";
  targetId: string;
  body: string;
  mentions: mongoose.Types.ObjectId[]; // @mentioned user ids
  assignedTo?: mongoose.Types.ObjectId; // task assignment
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetType: { type: String, enum: ["order", "product", "campaign", "report"], required: true },
    targetId: { type: String, required: true },
    body: { type: String, required: true, maxlength: 4000 },
    mentions: [{ type: Schema.Types.ObjectId, ref: "User" }],
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: Date,
  },
  { timestamps: true },
);

CommentSchema.index({ teamId: 1, targetType: 1, targetId: 1, createdAt: -1 });

export default models.Comment || model<IComment>("Comment", CommentSchema);
