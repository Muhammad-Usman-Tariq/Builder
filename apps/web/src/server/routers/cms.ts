import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { schema, saveSiteDocument } from "@builder/db";
import { router, siteProcedure, requireRole } from "../trpc";
import type { SiteDocument } from "@builder/document";
import { randomUUID } from "node:crypto";

const fieldDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
  type: z.enum(["text", "rich_text", "image", "date", "slug"]),
  required: z.boolean().optional(),
});

export const cmsRouter = router({
  /**
   * List all CMS collections for the site.
   */
  listCollections: siteProcedure.query(async ({ ctx }) => {
    const collections = await ctx.db
      .select()
      .from(schema.cmsCollections)
      .where(eq(schema.cmsCollections.siteId, ctx.site.id))
      .orderBy(desc(schema.cmsCollections.createdAt));

    // Get entry counts per collection
    const counts: Record<string, number> = {};
    for (const c of collections) {
      const entries = await ctx.db
        .select({ id: schema.cmsEntries.id })
        .from(schema.cmsEntries)
        .where(eq(schema.cmsEntries.collectionId, c.id));
      counts[c.id] = entries.length;
    }

    return collections.map((col) => ({
      ...col,
      entryCount: counts[col.id] || 0,
    }));
  }),

  /**
   * Create a new collection.
   */
  createCollection: siteProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().optional(),
        fields: z.array(fieldDefinitionSchema).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = `col_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const slug =
        input.slug ||
        input.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

      const defaultFields = input.fields || [
        { id: `f_${randomUUID().slice(0, 6)}`, name: "Title", key: "title", type: "text", required: true },
        { id: `f_${randomUUID().slice(0, 6)}`, name: "Slug", key: "slug", type: "slug", required: true },
      ];

      const [created] = await ctx.db
        .insert(schema.cmsCollections)
        .values({
          id,
          workspaceId: ctx.workspace.id,
          siteId: ctx.site.id,
          name: input.name,
          slug,
          schema: defaultFields,
        })
        .returning();

      return created;
    }),

  /**
   * Rename a collection.
   */
  renameCollection: siteProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        collectionId: z.string(),
        name: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(schema.cmsCollections)
        .set({
          name: input.name,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.cmsCollections.id, input.collectionId),
            eq(schema.cmsCollections.siteId, ctx.site.id)
          )
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "CMS collection not found",
        });
      }

      return updated;
    }),

  /**
   * Delete a collection.
   */
  deleteCollection: siteProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        collectionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(schema.cmsCollections)
        .where(
          and(
            eq(schema.cmsCollections.id, input.collectionId),
            eq(schema.cmsCollections.siteId, ctx.site.id)
          )
        );

      return { success: true };
    }),

  /**
   * List entries of a collection with optional search.
   */
  listEntries: siteProcedure
    .input(
      z.object({
        collectionId: z.string(),
        search: z.string().optional(),
        status: z.enum(["all", "draft", "published"]).optional().default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(schema.cmsEntries.siteId, ctx.site.id),
        eq(schema.cmsEntries.collectionId, input.collectionId),
      ];

      if (input.status && input.status !== "all") {
        conditions.push(eq(schema.cmsEntries.status, input.status));
      }

      let entries = await ctx.db
        .select()
        .from(schema.cmsEntries)
        .where(and(...conditions))
        .orderBy(desc(schema.cmsEntries.createdAt));

      if (input.search && input.search.trim()) {
        const query = input.search.trim().toLowerCase();
        entries = entries.filter(
          (e) =>
            e.title.toLowerCase().includes(query) ||
            e.slug.toLowerCase().includes(query) ||
            JSON.stringify(e.data).toLowerCase().includes(query)
        );
      }

      return entries;
    }),

  /**
   * Get single entry.
   */
  getEntry: siteProcedure
    .input(
      z.object({
        entryId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const [entry] = await ctx.db
        .select()
        .from(schema.cmsEntries)
        .where(
          and(
            eq(schema.cmsEntries.id, input.entryId),
            eq(schema.cmsEntries.siteId, ctx.site.id)
          )
        );

      if (!entry) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "CMS entry not found",
        });
      }

      return entry;
    }),

  /**
   * Create an entry.
   */
  createEntry: siteProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        collectionId: z.string(),
        title: z.string().min(1),
        slug: z.string().optional(),
        status: z.enum(["draft", "published"]).default("published"),
        data: z.record(z.any()).default({}),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = `ent_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const slug =
        input.slug ||
        input.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

      const [entry] = await ctx.db
        .insert(schema.cmsEntries)
        .values({
          id,
          collectionId: input.collectionId,
          siteId: ctx.site.id,
          title: input.title,
          slug,
          status: input.status,
          isSample: false,
          data: {
            ...input.data,
            title: input.title,
            slug,
          },
        })
        .returning();

      return entry;
    }),

  /**
   * Update an entry.
   */
  updateEntry: siteProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        entryId: z.string(),
        title: z.string().optional(),
        slug: z.string().optional(),
        status: z.enum(["draft", "published"]).optional(),
        data: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(schema.cmsEntries)
        .where(
          and(
            eq(schema.cmsEntries.id, input.entryId),
            eq(schema.cmsEntries.siteId, ctx.site.id)
          )
        );

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "CMS entry not found",
        });
      }

      const updatedTitle = input.title !== undefined ? input.title : existing.title;
      const updatedSlug = input.slug !== undefined ? input.slug : existing.slug;
      const updatedStatus = input.status !== undefined ? input.status : existing.status;
      const updatedData = {
        ...existing.data,
        ...(input.data || {}),
        title: updatedTitle,
        slug: updatedSlug,
      };

      const [updated] = await ctx.db
        .update(schema.cmsEntries)
        .set({
          title: updatedTitle,
          slug: updatedSlug,
          status: updatedStatus,
          data: updatedData,
          updatedAt: new Date(),
        })
        .where(eq(schema.cmsEntries.id, input.entryId))
        .returning();

      return updated;
    }),

  /**
   * Delete an entry.
   */
  deleteEntry: siteProcedure
    .use(requireRole("MEMBER"))
    .input(
      z.object({
        entryId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(schema.cmsEntries)
        .where(
          and(
            eq(schema.cmsEntries.id, input.entryId),
            eq(schema.cmsEntries.siteId, ctx.site.id)
          )
        );

      return { success: true };
    }),

  /**
   * "Add sample blog" button:
   * Creates a sample Blog collection + 3 published posts (with text, rich text, image, date)
   * + sample /blog and /blog/[slug] pages with one click.
   */
  addSampleBlog: siteProcedure
    .use(requireRole("MEMBER"))
    .mutation(async ({ ctx }) => {
      // 1. Check if Blog collection already exists, or create it
      let [collection] = await ctx.db
        .select()
        .from(schema.cmsCollections)
        .where(
          and(
            eq(schema.cmsCollections.siteId, ctx.site.id),
            eq(schema.cmsCollections.name, "Blog")
          )
        );

      if (!collection) {
        const colId = `col_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
        [collection] = await ctx.db
          .insert(schema.cmsCollections)
          .values({
            id: colId,
            workspaceId: ctx.workspace.id,
            siteId: ctx.site.id,
            name: "Blog",
            slug: "blog",
            schema: [
              { id: "f_title", name: "Title", key: "title", type: "text", required: true },
              { id: "f_slug", name: "Slug", key: "slug", type: "slug", required: true },
              { id: "f_author", name: "Author", key: "author", type: "text" },
              { id: "f_excerpt", name: "Excerpt", key: "excerpt", type: "text" },
              { id: "f_content", name: "Content", key: "content", type: "rich_text" },
              { id: "f_image", name: "Cover Image", key: "coverImage", type: "image" },
              { id: "f_date", name: "Published Date", key: "publishedAt", type: "date" },
            ],
          })
          .returning();
      }

      // 2. Insert 3 sample published posts clearly labeled 'Sample' in the title
      const samplePosts = [
        {
          id: `ent_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
          collectionId: collection!.id,
          siteId: ctx.site.id,
          title: "Sample: Welcome to our new blog",
          slug: "sample-welcome-to-our-new-blog",
          status: "published",
          isSample: true,
          data: {
            title: "Sample: Welcome to our new blog",
            slug: "sample-welcome-to-our-new-blog",
            author: "Alex Morgan",
            excerpt: "Discover the latest paradigms in responsive web design, component systems, and edge rendering.",
            content: "<h2>Modern Web Paradigms</h2><p>Modern web development has evolved rapidly over recent years. By combining server-side pre-rendering with robust client interactivity, applications achieve instant page loads and outstanding Core Web Vitals.</p><p>Clean document trees and static compilations ensure rock-solid stability.</p>",
            coverImage: "https://images.unsplash.com/photo-1498050108023-c5249f4df085",
            publishedAt: "2026-10-01",
          },
        },
        {
          id: `ent_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
          collectionId: collection!.id,
          siteId: ctx.site.id,
          title: "Sample: The Power of Visual Site Builders",
          slug: "sample-the-power-of-visual-site-builders",
          status: "published",
          isSample: true,
          data: {
            title: "Sample: The Power of Visual Site Builders",
            slug: "sample-the-power-of-visual-site-builders",
            author: "Sarah Chen",
            excerpt: "How structured document trees and bidirectional editing empower designers and developers alike.",
            content: "<h2>Design Without Compromise</h2><p>Visual website builders no longer mean messy code and inflexible layouts. With schema-first component registries and AST compilation, production sites remain maintainable, accessible, and blindingly fast.</p>",
            coverImage: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6",
            publishedAt: "2026-10-05",
          },
        },
        {
          id: `ent_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
          collectionId: collection!.id,
          siteId: ctx.site.id,
          title: "Sample: Scaling Next-Gen Jamstack Sites",
          slug: "sample-scaling-next-gen-jamstack-sites",
          status: "published",
          isSample: true,
          data: {
            title: "Sample: Scaling Next-Gen Jamstack Sites",
            slug: "sample-scaling-next-gen-jamstack-sites",
            author: "David Kim",
            excerpt: "Strategies for high-performance static asset generation, edge deployments, and instant rollbacks.",
            content: "<h2>Global Edge Delivery</h2><p>Deploying static assets to globally distributed CDNs guarantees maximum uptime and sub-second latency.</p><p>Learn how to optimize assets, configure cache invalidation, and set up zero-downtime deployment pipelines.</p>",
            coverImage: "https://images.unsplash.com/photo-1504639725590-34d0984388bd",
            publishedAt: "2026-10-08",
          },
        },
      ];

      for (const post of samplePosts) {
        await ctx.db
          .insert(schema.cmsEntries)
          .values(post)
          .onConflictDoNothing();
      }

      // 3. Update the site document with /blog and /blog/[slug] pages
      const [docRow] = await ctx.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, ctx.site.id));

      if (docRow?.snapshot) {
        const doc = JSON.parse(JSON.stringify(docRow.snapshot)) as SiteDocument;

        // Add /blog list page
        const blogPageId = "page_blog";
        const blogRootId = "el_blog_body";
        const blogContainerId = "el_blog_container";
        const blogHeaderId = "el_blog_header";
        const blogTitleId = "el_blog_title";
        const blogSubtitleId = "el_blog_subtitle";
        const blogListId = "el_blog_list";
        const blogCardId = "el_blog_card";
        const blogCardImgId = "el_blog_card_img";
        const blogCardBodyId = "el_blog_card_body";
        const blogCardTitleId = "el_blog_card_title";
        const blogCardMetaId = "el_blog_card_meta";
        const blogCardAuthorId = "el_blog_card_author";
        const blogCardDotId = "el_blog_card_dot";
        const blogCardDateId = "el_blog_card_date";
        const blogCardExcerptId = "el_blog_card_excerpt";

        // Add /blog/[slug] template page
        const postPageId = "page_blog_post";
        const postRootId = "el_post_body";
        const postContainerId = "el_post_container";
        const postBackLinkId = "el_post_back_link";
        const postHeroImgId = "el_post_img";
        const postMetaBoxId = "el_post_meta_box";
        const postAuthorId = "el_post_author";
        const postMetaDotId = "el_post_dot";
        const postDateId = "el_post_date";
        const postTitleId = "el_post_title";
        const postContentId = "el_post_content";

        doc.pages[blogPageId] = {
          id: blogPageId,
          name: "Blog",
          slug: "/blog",
          rootId: blogRootId,
          status: "published",
          seo: { title: "Blog" },
        };

        doc.pages[postPageId] = {
          id: postPageId,
          name: "Blog Post",
          slug: "/blog/[slug]",
          rootId: postRootId,
          status: "published",
          cmsTemplate: { collectionId: collection!.id },
          seo: { title: "Blog Post" },
        };

        // Styles for /blog
        doc.styles["s_blog_body"] = {
          id: "s_blog_body",
          kind: "local",
          values: {
            desktop: {
              default: {
                minHeight: { unit: "vh", value: 100 },
                backgroundColor: { token: "color.background" },
              },
            },
          },
        };

        doc.styles["s_blog_container"] = {
          id: "s_blog_container",
          kind: "local",
          values: {
            desktop: {
              default: {
                maxWidth: { unit: "px", value: 1100 },
                marginLeft: { keyword: "auto" },
                marginRight: { keyword: "auto" },
                width: { unit: "%", value: 100 },
                paddingTop: { unit: "px", value: 48 },
                paddingBottom: { unit: "px", value: 64 },
                paddingLeft: { unit: "px", value: 24 },
                paddingRight: { unit: "px", value: 24 },
              },
            },
          },
        };

        doc.styles["s_blog_header"] = {
          id: "s_blog_header",
          kind: "local",
          values: {
            desktop: {
              default: {
                marginBottom: { unit: "px", value: 48 },
                textAlign: { keyword: "center" },
              },
            },
          },
        };

        doc.styles["s_blog_title"] = {
          id: "s_blog_title",
          kind: "local",
          values: {
            desktop: {
              default: {
                fontSize: { unit: "px", value: 42 },
                fontWeight: { keyword: "700" },
                color: { token: "color.text" },
                fontFamily: { token: "fonts.heading" },
                lineHeight: { keyword: "1.2" },
              },
            },
          },
        };

        doc.styles["s_blog_subtitle"] = {
          id: "s_blog_subtitle",
          kind: "local",
          values: {
            desktop: {
              default: {
                fontSize: { unit: "px", value: 18 },
                color: { token: "color.textMuted" },
                marginTop: { unit: "px", value: 12 },
              },
            },
          },
        };

        doc.styles["s_blog_grid"] = {
          id: "s_blog_grid",
          kind: "local",
          values: {
            desktop: {
              default: {
                display: { keyword: "grid" },
                gridTemplateColumns: { raw: "repeat(3, minmax(0, 1fr))" },
                gap: { unit: "px", value: 28 },
                width: { unit: "%", value: 100 },
                alignItems: { keyword: "stretch" },
              },
            },
            tablet: {
              default: {
                gridTemplateColumns: { raw: "repeat(2, minmax(0, 1fr))" },
                gap: { unit: "px", value: 20 },
              },
            },
            mobile: {
              default: {
                gridTemplateColumns: { raw: "repeat(1, minmax(0, 1fr))" },
                gap: { unit: "px", value: 16 },
              },
            },
          },
        };

        doc.styles["s_blog_card"] = {
          id: "s_blog_card",
          kind: "local",
          values: {
            desktop: {
              default: {
                display: { keyword: "flex" },
                flexDirection: { keyword: "column" },
                height: { unit: "%", value: 100 },
                backgroundColor: { token: "color.surface" },
                borderRadius: { token: "radius.lg" },
                border: { raw: "1px solid #e2e8f0" },
                overflow: { keyword: "hidden" },
                boxShadow: { token: "shadow.sm" },
                transition: { raw: "transform 0.2s ease, box-shadow 0.2s ease" },
              },
              hover: {
                transform: { raw: "translateY(-4px)" },
                boxShadow: { token: "shadow.md" },
              },
            },
          },
        };

        doc.styles["s_blog_card_img"] = {
          id: "s_blog_card_img",
          kind: "local",
          values: {
            desktop: {
              default: {
                width: { unit: "%", value: 100 },
                aspectRatio: { raw: "16 / 9" },
                objectFit: { keyword: "cover" },
                display: { keyword: "block" },
              },
            },
          },
        };

        doc.styles["s_blog_card_body"] = {
          id: "s_blog_card_body",
          kind: "local",
          values: {
            desktop: {
              default: {
                padding: { unit: "px", value: 20 },
                display: { keyword: "flex" },
                flexDirection: { keyword: "column" },
                flex: { raw: "1 1 auto" },
                gap: { unit: "px", value: 10 },
              },
            },
          },
        };

        doc.styles["s_blog_card_title"] = {
          id: "s_blog_card_title",
          kind: "local",
          values: {
            desktop: {
              default: {
                fontSize: { unit: "px", value: 20 },
                fontWeight: { keyword: "600" },
                color: { token: "color.text" },
                fontFamily: { token: "fonts.heading" },
                lineHeight: { keyword: "1.3" },
              },
            },
          },
        };

        doc.styles["s_blog_card_meta"] = {
          id: "s_blog_card_meta",
          kind: "local",
          values: {
            desktop: {
              default: {
                display: { keyword: "flex" },
                alignItems: { keyword: "center" },
                gap: { unit: "px", value: 8 },
                fontSize: { unit: "px", value: 13 },
                color: { token: "color.textMuted" },
              },
            },
          },
        };

        doc.styles["s_blog_card_author"] = {
          id: "s_blog_card_author",
          kind: "local",
          values: {
            desktop: {
              default: {
                fontSize: { unit: "px", value: 13 },
                color: { token: "color.textMuted" },
                fontWeight: { keyword: "500" },
              },
            },
          },
        };

        doc.styles["s_blog_card_date"] = {
          id: "s_blog_card_date",
          kind: "local",
          values: {
            desktop: {
              default: {
                fontSize: { unit: "px", value: 13 },
                color: { token: "color.textMuted" },
                fontWeight: { keyword: "400" },
              },
            },
          },
        };

        doc.styles["s_blog_card_excerpt"] = {
          id: "s_blog_card_excerpt",
          kind: "local",
          values: {
            desktop: {
              default: {
                fontSize: { unit: "px", value: 14 },
                color: { token: "color.textMuted" },
                lineHeight: { keyword: "1.6" },
              },
            },
          },
        };

        // Elements for /blog
        doc.elements[blogRootId] = {
          id: blogRootId,
          type: "Body",
          name: "Body",
          parentId: null,
          children: [blogContainerId],
          props: {},
          styleIds: ["s_blog_body"],
        };
        doc.elements[blogContainerId] = {
          id: blogContainerId,
          type: "Container",
          name: "Blog Container",
          parentId: blogRootId,
          children: [blogHeaderId, blogListId],
          props: { maxWidth: "1100px" },
          styleIds: ["s_blog_container"],
        };
        doc.elements[blogHeaderId] = {
          id: blogHeaderId,
          type: "Section",
          name: "Header Section",
          parentId: blogContainerId,
          children: [blogTitleId, blogSubtitleId],
          props: {},
          styleIds: ["s_blog_header"],
        };
        doc.elements[blogTitleId] = {
          id: blogTitleId,
          type: "Heading",
          name: "Blog Title",
          parentId: blogHeaderId,
          children: [],
          props: { text: "Our Blog", level: 1 },
          styleIds: ["s_blog_title"],
        };
        doc.elements[blogSubtitleId] = {
          id: blogSubtitleId,
          type: "Text",
          name: "Blog Subtitle",
          parentId: blogHeaderId,
          children: [],
          props: { text: "Insights, updates, and engineering thoughts from our team." },
          styleIds: ["s_blog_subtitle"],
        };
        doc.elements[blogListId] = {
          id: blogListId,
          type: "CmsList",
          name: "Posts Grid",
          parentId: blogContainerId,
          children: [blogCardId],
          props: {
            collectionId: collection!.id,
            collectionName: "Blog",
            limit: 6,
            sortBy: "createdAt",
            sortOrder: "desc",
          },
          styleIds: ["s_blog_grid"],
        };
        doc.elements[blogCardId] = {
          id: blogCardId,
          type: "Box",
          name: "Post Card",
          parentId: blogListId,
          children: [blogCardImgId, blogCardBodyId],
          props: {},
          styleIds: ["s_blog_card"],
        };
        doc.elements[blogCardImgId] = {
          id: blogCardImgId,
          type: "CmsField",
          name: "Cover Image",
          parentId: blogCardId,
          children: [],
          props: { fieldKey: "coverImage", fieldType: "image" },
          styleIds: ["s_blog_card_img"],
        };
        doc.elements[blogCardBodyId] = {
          id: blogCardBodyId,
          type: "Box",
          name: "Card Content",
          parentId: blogCardId,
          children: [blogCardTitleId, blogCardMetaId, blogCardExcerptId],
          props: {},
          styleIds: ["s_blog_card_body"],
        };
        doc.elements[blogCardTitleId] = {
          id: blogCardTitleId,
          type: "CmsField",
          name: "Title",
          parentId: blogCardBodyId,
          children: [],
          props: { fieldKey: "title", fieldType: "text" },
          styleIds: ["s_blog_card_title"],
        };
        doc.elements[blogCardMetaId] = {
          id: blogCardMetaId,
          type: "Box",
          name: "Card Meta",
          parentId: blogCardBodyId,
          children: [blogCardAuthorId, blogCardDotId, blogCardDateId],
          props: {},
          styleIds: ["s_blog_card_meta"],
        };
        doc.elements[blogCardAuthorId] = {
          id: blogCardAuthorId,
          type: "CmsField",
          name: "Author",
          parentId: blogCardMetaId,
          children: [],
          props: { fieldKey: "author", fieldType: "text", fallback: "Editorial Team" },
          styleIds: ["s_blog_card_author"],
        };
        doc.elements[blogCardDotId] = {
          id: blogCardDotId,
          type: "Text",
          name: "Meta Dot",
          parentId: blogCardMetaId,
          children: [],
          props: { text: "•" },
          styleIds: [],
        };
        doc.elements[blogCardDateId] = {
          id: blogCardDateId,
          type: "CmsField",
          name: "Date",
          parentId: blogCardMetaId,
          children: [],
          props: { fieldKey: "publishedAt", fieldType: "date" },
          styleIds: ["s_blog_card_date"],
        };
        doc.elements[blogCardExcerptId] = {
          id: blogCardExcerptId,
          type: "CmsField",
          name: "Excerpt",
          parentId: blogCardBodyId,
          children: [],
          props: { fieldKey: "excerpt", fieldType: "text" },
          styleIds: ["s_blog_card_excerpt"],
        };

        // Styles for /blog/[slug]
        doc.styles["s_post_body"] = {
          id: "s_post_body",
          kind: "local",
          values: {
            desktop: {
              default: {
                minHeight: { unit: "vh", value: 100 },
                backgroundColor: { token: "color.background" },
              },
            },
          },
        };

        doc.styles["s_post_container"] = {
          id: "s_post_container",
          kind: "local",
          values: {
            desktop: {
              default: {
                maxWidth: { unit: "px", value: 720 },
                marginLeft: { keyword: "auto" },
                marginRight: { keyword: "auto" },
                width: { unit: "%", value: 100 },
                paddingTop: { unit: "px", value: 48 },
                paddingBottom: { unit: "px", value: 80 },
                paddingLeft: { unit: "px", value: 20 },
                paddingRight: { unit: "px", value: 20 },
                display: { keyword: "flex" },
                flexDirection: { keyword: "column" },
                gap: { unit: "px", value: 24 },
              },
            },
          },
        };

        doc.styles["s_post_back_link"] = {
          id: "s_post_back_link",
          kind: "local",
          values: {
            desktop: {
              default: {
                fontSize: { unit: "px", value: 14 },
                fontWeight: { keyword: "500" },
                color: { token: "color.accent" },
                textDecoration: { keyword: "none" },
                display: { keyword: "inline-flex" },
              },
            },
          },
        };

        doc.styles["s_post_hero_img"] = {
          id: "s_post_hero_img",
          kind: "local",
          values: {
            desktop: {
              default: {
                width: { unit: "%", value: 100 },
                aspectRatio: { raw: "16 / 9" },
                objectFit: { keyword: "cover" },
                borderRadius: { token: "radius.lg" },
                display: { keyword: "block" },
              },
            },
          },
        };

        doc.styles["s_post_meta_box"] = {
          id: "s_post_meta_box",
          kind: "local",
          values: {
            desktop: {
              default: {
                display: { keyword: "flex" },
                alignItems: { keyword: "center" },
                gap: { unit: "px", value: 8 },
              },
            },
          },
        };

        doc.styles["s_post_author"] = {
          id: "s_post_author",
          kind: "local",
          values: {
            desktop: {
              default: {
                fontSize: { unit: "px", value: 14 },
                fontWeight: { keyword: "600" },
                color: { token: "color.text" },
              },
            },
          },
        };

        doc.styles["s_post_dot"] = {
          id: "s_post_dot",
          kind: "local",
          values: {
            desktop: {
              default: {
                fontSize: { unit: "px", value: 14 },
                color: { token: "color.textMuted" },
              },
            },
          },
        };

        doc.styles["s_post_date"] = {
          id: "s_post_date",
          kind: "local",
          values: {
            desktop: {
              default: {
                fontSize: { unit: "px", value: 14 },
                color: { token: "color.textMuted" },
              },
            },
          },
        };

        doc.styles["s_post_title"] = {
          id: "s_post_title",
          kind: "local",
          values: {
            desktop: {
              default: {
                fontSize: { unit: "px", value: 38 },
                fontWeight: { keyword: "700" },
                color: { token: "color.text" },
                fontFamily: { token: "fonts.heading" },
                lineHeight: { keyword: "1.25" },
              },
            },
          },
        };

        doc.styles["s_post_content"] = {
          id: "s_post_content",
          kind: "local",
          values: {
            desktop: {
              default: {
                fontSize: { unit: "px", value: 18 },
                lineHeight: { keyword: "1.75" },
                color: { token: "color.text" },
                fontFamily: { token: "fonts.body" },
              },
            },
          },
        };

        // Elements for /blog/[slug]
        doc.elements[postRootId] = {
          id: postRootId,
          type: "Body",
          name: "Post Body",
          parentId: null,
          children: [postContainerId],
          props: {},
          styleIds: ["s_post_body"],
        };
        doc.elements[postContainerId] = {
          id: postContainerId,
          type: "Container",
          name: "Post Container",
          parentId: postRootId,
          children: [postBackLinkId, postHeroImgId, postMetaBoxId, postTitleId, postContentId],
          props: { maxWidth: "720px" },
          styleIds: ["s_post_container"],
        };
        doc.elements[postBackLinkId] = {
          id: postBackLinkId,
          type: "Link",
          name: "Back Link",
          parentId: postContainerId,
          children: [],
          props: { href: "/blog", text: "← Back to all posts" },
          styleIds: ["s_post_back_link"],
        };
        doc.elements[postHeroImgId] = {
          id: postHeroImgId,
          type: "CmsField",
          name: "Hero Image",
          parentId: postContainerId,
          children: [],
          props: { fieldKey: "coverImage", fieldType: "image" },
          styleIds: ["s_post_hero_img"],
        };
        doc.elements[postMetaBoxId] = {
          id: postMetaBoxId,
          type: "Box",
          name: "Post Meta",
          parentId: postContainerId,
          children: [postAuthorId, postMetaDotId, postDateId],
          props: {},
          styleIds: ["s_post_meta_box"],
        };
        doc.elements[postAuthorId] = {
          id: postAuthorId,
          type: "Text",
          name: "Author",
          parentId: postMetaBoxId,
          children: [],
          props: { text: "By Editorial Team" },
          styleIds: ["s_post_author"],
        };
        doc.elements[postMetaDotId] = {
          id: postMetaDotId,
          type: "Text",
          name: "Dot",
          parentId: postMetaBoxId,
          children: [],
          props: { text: "•" },
          styleIds: ["s_post_dot"],
        };
        doc.elements[postDateId] = {
          id: postDateId,
          type: "CmsField",
          name: "Post Date",
          parentId: postMetaBoxId,
          children: [],
          props: { fieldKey: "publishedAt", fieldType: "date" },
          styleIds: ["s_post_date"],
        };
        doc.elements[postTitleId] = {
          id: postTitleId,
          type: "CmsField",
          name: "Post Title",
          parentId: postContainerId,
          children: [],
          props: { fieldKey: "title", fieldType: "text", tag: "h1" },
          styleIds: ["s_post_title"],
        };
        doc.elements[postContentId] = {
          id: postContentId,
          type: "CmsField",
          name: "Post Rich Content",
          parentId: postContainerId,
          children: [],
          props: { fieldKey: "content", fieldType: "rich_text" },
          styleIds: ["s_post_content"],
        };

        await saveSiteDocument(ctx.db, {
          siteId: ctx.site.id,
          document: doc as SiteDocument,
        });

        return {
          success: true,
          collection,
          posts: samplePosts,
          document: doc as SiteDocument,
        };
      }

      return {
        success: true,
        collection,
        posts: samplePosts,
        document: undefined,
      };
    }),

  /**
   * "Remove sample content" button:
   * Removes sample collections, sample entries, and cleans up /blog and /blog/[slug] pages.
   */
  removeSampleBlog: siteProcedure
    .use(requireRole("MEMBER"))
    .mutation(async ({ ctx }) => {
      // 1. Delete all sample entries
      await ctx.db
        .delete(schema.cmsEntries)
        .where(
          and(
            eq(schema.cmsEntries.siteId, ctx.site.id),
            eq(schema.cmsEntries.isSample, true)
          )
        );

      // 2. Check if Blog collection has 0 remaining entries; if so, delete it
      const blogCols = await ctx.db
        .select()
        .from(schema.cmsCollections)
        .where(
          and(
            eq(schema.cmsCollections.siteId, ctx.site.id),
            eq(schema.cmsCollections.name, "Blog")
          )
        );

      for (const col of blogCols) {
        const remaining = await ctx.db
          .select({ id: schema.cmsEntries.id })
          .from(schema.cmsEntries)
          .where(eq(schema.cmsEntries.collectionId, col.id));

        if (remaining.length === 0) {
          await ctx.db
            .delete(schema.cmsCollections)
            .where(eq(schema.cmsCollections.id, col.id));
        }
      }

      // 3. Remove sample pages (/blog and /blog/[slug]) from site document
      const [docRow] = await ctx.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, ctx.site.id));

      if (docRow?.snapshot) {
        const doc = JSON.parse(JSON.stringify(docRow.snapshot)) as SiteDocument;
        const pagesToRemove = ["page_blog", "page_blog_post"];
        const elementIdsToRemove = [
          "el_blog_body",
          "el_blog_container",
          "el_blog_header",
          "el_blog_title",
          "el_blog_subtitle",
          "el_blog_list",
          "el_blog_card",
          "el_blog_card_img",
          "el_blog_card_body",
          "el_blog_card_title",
          "el_blog_card_meta",
          "el_blog_card_author",
          "el_blog_card_dot",
          "el_blog_card_date",
          "el_blog_card_excerpt",
          "el_post_body",
          "el_post_container",
          "el_post_back_link",
          "el_post_section",
          "el_post_img",
          "el_post_meta_box",
          "el_post_author",
          "el_post_dot",
          "el_post_title",
          "el_post_date",
          "el_post_content",
        ];

        for (const pId of pagesToRemove) {
          delete doc.pages[pId];
        }
        for (const elId of elementIdsToRemove) {
          delete doc.elements[elId];
        }

        await saveSiteDocument(ctx.db, {
          siteId: ctx.site.id,
          document: doc as SiteDocument,
        });

        return {
          success: true,
          document: doc as SiteDocument,
        };
      }

      return { success: true, document: undefined };
    }),
});
