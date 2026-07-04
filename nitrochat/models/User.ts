import mongoose, { Schema, model, models } from 'mongoose';

const UserSchema = new Schema({
    email: { type: String, required: true, unique: true },
    name: { type: String },
    picture: { type: String },
    lastLogin: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
});

const User = models.User || model('User', UserSchema);

export default User;
