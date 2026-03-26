import mongoose from 'mongoose';
import AutoIncrementFactory from "mongoose-sequence";

const AutoIncrement = AutoIncrementFactory(mongoose);

const adminSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
}, {
    timestamps: true,
    toJSON: {
        transform(doc, ret) {
            ret.id = ret.aid; // Admin ID
            delete ret.aid;
            delete ret._id;
            delete ret.__v;
        }
    }
});

adminSchema.plugin(AutoIncrement, { inc_field: 'aid' });

export default mongoose.model('Admin', adminSchema);
