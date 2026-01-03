
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const coachId = searchParams.get('coachId');

    try {
        let whereClause = {};

        if (coachId) {
            whereClause = { coach_id: coachId };
        } else {
             // Default? user search? For now just return empty or all clients?
             // Let's restrict to only returning if coachId is provided for safety/relevance context
             return NextResponse.json([]);
        }

        const users = await prisma.users.findMany({
            where: whereClause,
            orderBy: { name: 'asc' }
        });

        return NextResponse.json(users);
    } catch (error) {
        console.error("GET Users Error:", error);
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}
