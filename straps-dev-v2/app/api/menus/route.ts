
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const userIdHeader = request.headers.get('x-user-id');
        const userId = userIdHeader || null; // String ID

        let whereClause = {};

        if (userId) {
            const user = await prisma.users.findUnique({ where: { id: userId } });
            if (user?.role === 'COACH') {
                whereClause = { author_id: userId };
            } else if (user?.role === 'CLIENT') {
                whereClause = { client_id: userId }; // Only see assigned menus
            }
        }

        const menus = await prisma.training_menus.findMany({
            where: whereClause,
            include: {
                assigned_client: {
                    select: { name: true, id: true }
                }
            },
            orderBy: { created_at: 'desc' }
        });
        return NextResponse.json(menus);
    } catch (error) {
        console.error("GET Error:", error);
        return NextResponse.json({ error: 'Failed to fetch menus' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const userIdHeader = request.headers.get('x-user-id');
        const authorId = userIdHeader || null; // String ID
        
        const body = await request.json();
        const { name, exercises, client_id } = body;
        const newMenu = await prisma.training_menus.create({
            data: {
                name,
                exercises: exercises,
                created_at: new Date(),
                author_id: authorId,
                client_id: client_id || null // Save assigned client
            }
        });
        return NextResponse.json(newMenu);
    } catch (error) {
        console.error("POST Error:", error);
        return NextResponse.json({ error: 'Failed to create menu' }, { status: 500 });
    }
}
