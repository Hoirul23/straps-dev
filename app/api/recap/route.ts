
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { menu_id, summary } = body;
        
        const recap = await prisma.user_recaps.create({
            data: {
                menu_id: Number(menu_id),
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
export async function GET() {
    try {
        const recaps = await prisma.user_recaps.findMany({
            take: 50,
            orderBy: { completed_at: 'desc' }
        });
        return NextResponse.json(recaps);
    } catch (error) {
        console.error("GET Recap Error:", error);
        return NextResponse.json({ error: 'Failed to fetch recaps' }, { status: 500 });
    }
}
