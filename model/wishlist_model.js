import mongoose from "mongoose";
import AutoIncrementFactory from "mongoose-sequence";

const AutoIncrement = AutoIncrementFactory(mongoose);

const wishlistSchema = new mongoose.Schema(
    {
        wid: {
            type: Number,
            unique: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        items: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Category",
            }
        ],
    },
    {
        timestamps: true,
        toJSON: {
            transform(doc, ret) {
                ret.id = ret.wid || ret._id;
                delete ret.wid;
                delete ret._id;
                delete ret.__v;
            },
        },
    }
);

wishlistSchema.plugin(AutoIncrement, { inc_field: 'wid' });

export default mongoose.model("Wishlist", wishlistSchema);
