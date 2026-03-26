import mongoose from "mongoose";
import AutoIncrementFactory from "mongoose-sequence";

const AutoIncrement = AutoIncrementFactory(mongoose);

const categorySchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
        },
        imageUrl: {
            type: String,
            required: true,
        },
        prompt: {
            type: String,
            required: true,
        },
        category: {
            type: String,
            default: "FASHION"
        },
        modelName: {
            type: String,
            default: "Midjourney V6"
        },
        tags: {
            type: [String],
            default: []
        },
    },
    {
        timestamps: true,
        toJSON: {
            transform(doc, ret) {
                ret.id = ret.cid || ret._id;
                delete ret.cid;
                delete ret._id;
                delete ret.__v;
            },
        },
    }
);

categorySchema.plugin(AutoIncrement, { inc_field: 'cid' });

export default mongoose.model("Category", categorySchema);