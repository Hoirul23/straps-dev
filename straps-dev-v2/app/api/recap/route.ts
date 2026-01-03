
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { menu_id, user_id, summary } = body;
        
        const recap = await prisma.user_recaps.create({
            data: {
                menu_id: Number(menu_id), // Menu ID stays Int
                user_id: user_id ? String(user_id) : null,
                summary: summary,
                completed_at: new Date()
            }
        });
        
        return NextResponse.json(recap);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to save recap' }, { status: 500 });
    }
}
export async function GET(request: Request) {
    try {
        const userIdHeader = request.headers.get('x-user-id');
        const userId = userIdHeader || null; // String ID

        let whereClause = {};

        if (userId) {
            const user = await prisma.users.findUnique({ 
                where: { id: userId },
                include: { clients: true }
            });

            if (user?.role === 'COACH') {
                // Coach sees recaps from their clients
                const clientIds = user.clients.map(c => c.id);
                whereClause = { user_id: { in: clientIds } };
            } else if (user?.role === 'CLIENT') {
                // Client sees only their own recaps
                whereClause = { user_id: userId };
            }
        }

        const recaps = await prisma.user_recaps.findMany({
            where: whereClause,
            take: 50,
            include: {
                user: { select: { name: true, id: true } },
                training_menus: { select: { name: true, id: true } }
            },
            orderBy: { completed_at: 'desc' }
        });
        return NextResponse.json(recaps);
    } catch (error) {
        console.error("GET Recap Error:", error);
        return NextResponse.json({ error: 'Failed to fetch recaps' }, { status: 500 });
    }
}
