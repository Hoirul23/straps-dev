import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const userIdHeader = request.headers.get('x-user-id');
        if (!userIdHeader) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { status, confidence, details } = body; // Confidence as string "0.95" etc

        const log = await prisma.activity_logs.create({
            data: {
                user_id: userIdHeader,
                timestamp: new Date(),
                status: status || 'Unknown',
                confidence: String(confidence),
                details: details || {}
            }
        });

        return NextResponse.json({ success: true, id: log.id });
    } catch (error) {
        console.error("Log Error:", error);
        return NextResponse.json({ error: 'Failed to log' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const userIdHeader = request.headers.get('x-user-id');
        if (!userIdHeader) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const logs = await prisma.activity_logs.findMany({
            where: { user_id: userIdHeader },
            orderBy: { timestamp: 'desc' },
            take: 20
        });

        return NextResponse.json({ logs });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }
}
