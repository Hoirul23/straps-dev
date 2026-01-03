
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { coachId, clientId } = body;

        if (!coachId || !clientId) {
            return NextResponse.json({ error: 'Coach ID and Client ID are required' }, { status: 400 });
        }

        // Validate Coach
        const coach = await prisma.users.findUnique({ where: { id: String(coachId) } });
        if (!coach || coach.role !== 'COACH') {
            return NextResponse.json({ error: 'Invalid Coach ID' }, { status: 400 });
        }

        // Validate Client
        const client = await prisma.users.findUnique({ where: { id: String(clientId) } });
        if (!client) { // Allow taking over any user as long as they exist? Ideally check if they are CLIENT role.
             return NextResponse.json({ error: 'Client not found' }, { status: 404 });
        }
        if (client.role !== 'CLIENT') {
            return NextResponse.json({ error: 'Target user is not a Client' }, { status: 400 });
        }

        // Update Link
        const updatedClient = await prisma.users.update({
            where: { id: String(clientId) },
            data: { coach_id: String(coachId) }
        });

        return NextResponse.json(updatedClient);
    } catch (error) {
        console.error("Link Client Error:", error);
        return NextResponse.json({ error: 'Failed to link client' }, { status: 500 });
    }
}
