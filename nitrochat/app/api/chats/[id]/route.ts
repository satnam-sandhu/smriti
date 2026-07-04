import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db';
import Chat from '@/models/Chat';
import { getUserFromRequest } from '@/lib/auth-server';
import { generateChatTitle } from '@/lib/generate-chat-title';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectToDatabase();
        const chat = await Chat.findOne({ _id: params.id, userId: user._id });

        if (!chat) {
            return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
        }

        return NextResponse.json(chat);
    } catch (error) {
        console.error('Error fetching chat:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { messages, title: explicitTitle } = body;

        await connectToDatabase();

        const update: any = {};
        if (messages) update.messages = messages;
        if (explicitTitle) update.title = explicitTitle;

        const existingChat = await Chat.findOne({ _id: params.id, userId: user._id });
        if (!existingChat) {
            return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
        }

        // Generate title via LLM when chat still has default title and we have at least one exchange
        if (!explicitTitle && messages && messages.length >= 2) {
            const currentTitle = (existingChat.title || '').trim();
            if (currentTitle === '' || currentTitle === 'New Chat') {
                try {
                    const generatedTitle = await generateChatTitle(messages);
                    if (generatedTitle) update.title = generatedTitle;
                } catch (err) {
                    console.error('Error generating chat title:', err);
                }
            }
        }

        const chat = await Chat.findOneAndUpdate(
            { _id: params.id, userId: user._id },
            update,
            { new: true }
        );

        if (!chat) {
            return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
        }

        return NextResponse.json(chat);
    } catch (error) {
        console.error('Error updating chat:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
    try {
        const user = await getUserFromRequest(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectToDatabase();
        const chat = await Chat.findOneAndDelete({ _id: params.id, userId: user._id });

        if (!chat) {
            return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting chat:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
