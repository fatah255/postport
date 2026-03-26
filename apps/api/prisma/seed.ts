import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient, LocaleCode, MembershipRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@postport.local";
  const passwordHash = await argon2.hash("postport123!");

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      fullName: "PostPort Admin",
      passwordHash
    },
    create: {
      email,
      fullName: "PostPort Admin",
      passwordHash,
      locale: LocaleCode.EN
    }
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: "postport-demo" },
    update: {
      ownerId: user.id
    },
    create: {
      name: "PostPort Demo",
      slug: "postport-demo",
      ownerId: user.id
    }
  });

  await prisma.membership.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id
      }
    },
    update: { role: MembershipRole.OWNER },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: MembershipRole.OWNER
    }
  });

  await prisma.mediaFolder.upsert({
    where: {
      workspaceId_path: {
        workspaceId: workspace.id,
        path: "/"
      }
    },
    update: {
      name: "Root"
    },
    create: {
      workspaceId: workspace.id,
      name: "Root",
      path: "/"
    }
  });

   
  console.log("Seed complete:", { userEmail: email, workspaceSlug: workspace.slug });
}

main()
  .catch((error) => {
     
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
