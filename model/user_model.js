import mongoose from 'mongoose';
import AutoIncrementFactory from "mongoose-sequence";

const AutoIncrement = AutoIncrementFactory(mongoose);

const userSchema = new mongoose.Schema({
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
    status: {
        type: String,
        enum: ['active', 'pending'],
        default: 'active'
    },
}, {
    timestamps: true,
    toJSON: {
        transform(doc, ret) {
            ret.id = ret.uid;
            delete ret.uid;
            delete ret._id;
            delete ret.__v;
        }
    }
});

userSchema.plugin(AutoIncrement, { inc_field: 'uid' });

export default mongoose.model('User', userSchema);

