import mongoose, { Schema, model, models } from 'mongoose';

const ChatSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, default: 'New Chat' },
    messages: [{
        id: { type: String },
        role: { type: String, required: true },
        content: { type: String, default: '' },
        timestamp: { type: Number, default: Date.now },
        toolCalls: { type: Array },
        toolCallId: { type: String },
        toolName: { type: String },
        result: { type: Schema.Types.Mixed },
    }],
    provider: { type: String, default: 'gateway' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// Update updatedAt on save
ChatSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

const Chat = models.Chat || model('Chat', ChatSchema);

export default Chat;
