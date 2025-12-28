
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
    request: Request,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const id = parseInt(params.id);
        if (isNaN(id)) {
            return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
        }

        const recap = await prisma.user_recaps.findUnique({
            where: { id: id },
            include: {
                training_menus: true // Include menu details
            }
        });

        if (!recap) {
            return NextResponse.json({ error: 'Recap not found' }, { status: 404 });
        }

        return NextResponse.json(recap);
    } catch (error) {
        console.error("GET Recap Detail Error:", error);
        return NextResponse.json({ error: 'Failed to fetch recap' }, { status: 500 });
    }
}
