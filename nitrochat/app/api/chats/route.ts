import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Chat from '@/models/Chat';
import { getUserFromRequest } from '@/lib/auth-server';
import { generateChatTitle } from '@/lib/generate-chat-title';

export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get pagination parameters from query
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const skip = (page - 1) * limit;

        await connectToDatabase();
        const chats = await Chat.find({ userId: user._id })
            .select('title createdAt updatedAt')
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit);

        return NextResponse.json(chats);
    } catch (error) {
        console.error('Error fetching chats:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { messages, provider } = body;

        await connectToDatabase();

        const messageList = messages || [];
        let title = 'New Chat';
        // Generate title via LLM when we already have first exchange (user + assistant)
        if (messageList.length >= 2) {
            try {
                const generated = await generateChatTitle(messageList);
                if (generated) title = generated;
            } catch (err) {
                console.error('Error generating chat title on create:', err);
            }
        }

        const chat = await Chat.create({
            userId: user._id,
            title,
            messages: messageList,
            provider: provider || 'gateway',
        });

        return NextResponse.json(chat);
    } catch (error) {
        console.error('Error creating chat:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectToDatabase();
        const result = await Chat.deleteMany({ userId: user._id });

        return NextResponse.json({ deletedCount: result.deletedCount });
    } catch (error) {
        console.error('Error deleting all chats:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
