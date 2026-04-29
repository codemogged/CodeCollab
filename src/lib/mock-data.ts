// ─── Types ───────────────────────────────────────────────

export interface Friend {
  name: string;
  initials: string;
  online: boolean;
}

export interface Member extends Friend {
  role?: string;
}

export type ProjectColor = "sun" | "coral" | "aqua" | "violet";

export interface Project {
  id: string;
  name: string;
  emoji: string;
  status: string;
  progress: number;
  color: ProjectColor;
  members: Member[];
  updatedAgo: string;
}

export interface Task {
  id: string;
  title: string;
  status: "now" | "ai" | "waiting" | "done";
  priority?: "high" | "mid" | "low";
  assignee?: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  note: string;
  time: string;
  type: "ai" | "human" | "expert" | "system";
}

export interface Expert {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  rate: string;
  rating: number;
  bio: string;
  skills: string[];
  jobs: number;
  available: boolean;
}

export interface Idea {
  id: string;
  name: string;
  emoji: string;
  description: string;
  friends: Friend[];
  vibe: "just started" | "coming along" | "almost there" | "live";
  lastUpdate: string;
  updatedAgo: string;
}

export type ArtifactPreviewMode = "interface" | "flow" | "runtime" | "data";

export interface ArtifactPreviewView {
  id: string;
  label: string;
  description: string;
}

export interface ArtifactInterfaceScreen {
  id: string;
  label: string;
  title: string;
  note: string;
  accent: string;
  blocks: string[];
}

export interface ArtifactFlowStep {
  id: string;
  title: string;
  detail: string;
  state: "done" | "active" | "next";
  viewId?: string;
}

export interface ArtifactRuntimeMetric {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "live" | "warn";
  viewId?: string;
}

export interface ArtifactRuntimeEvent {
  id: string;
  time: string;
  label: string;
  detail: string;
  viewId?: string;
}

export interface ArtifactDataColumn {
  key: string;
  label: string;
}

export interface ArtifactDataRow {
  viewId?: string;
  [key: string]: string | undefined;
}

export interface ArtifactPreviewModel {
  mode: ArtifactPreviewMode;
  artifactType: string;
  summary: string;
  primaryActionLabel: string;
  views: ArtifactPreviewView[];
  screens?: ArtifactInterfaceScreen[];
  flowSteps?: ArtifactFlowStep[];
  runtimeMetrics?: ArtifactRuntimeMetric[];
  runtimeEvents?: ArtifactRuntimeEvent[];
  dataColumns?: ArtifactDataColumn[];
  dataRows?: ArtifactDataRow[];
  codeFileName?: string;
}

export interface BuildArtifact {
  id: string;
  title: string;
  description: string;
  status: "done" | "building" | "planned";
  updatedAgo: string;
  changes: string[];
  code: string;
  preview: ArtifactPreviewModel;
}

export type BuildTaskStatus = "planned" | "building" | "review" | "done";
export type AgentMode = "shared" | "new";

export interface BuildPlanTask {
  id: string;
  title: string;
  status: BuildTaskStatus;
  owner: string;
  reviewer?: string;
  note: string;
  dueDate: string;
  startingPrompt: string;
}

export interface PreviewDescriptor {
  eyebrow: string;
  title: string;
  subtitle: string;
  accent: string;
  cards: string[];
}

export interface SubprojectPlan {
  id: string;
  title: string;
  goal: string;
  status: BuildTaskStatus;
  updatedAgo: string;
  agentName: string;
  agentBrief: string;
  preview: PreviewDescriptor;
  tasks: BuildPlanTask[];
}

export interface ProjectBuildPlan {
  id: string;
  projectId: string;
  prompt: string;
  summary: string;
  nextAction: string;
  projectPreview: PreviewDescriptor;
  buildOrder: BuildOrderStep[];
  subprojects: SubprojectPlan[];
}

export interface BuildOrderStep {
  id: string;
  sequence: number;
  title: string;
  summary: string;
  subprojectId: string;
  taskIds: string[];
}

export interface Message {
  id: string;
  from: string;
  initials: string;
  text: string;
  time: string;
  isAI?: boolean;
  isMine?: boolean;
  buildId?: string;
}

export interface TaskConversationThread {
  id: string;
  taskId: string;
  subprojectId: string;
  subprojectTitle: string;
  title: string;
  agentName: string;
  updatedAgo: string;
  summary: string;
  messages: Message[];
}

export interface SocialMessage {
  id: string;
  from: string;
  initials: string;
  text: string;
  time: string;
  isMine?: boolean;
}

export interface ProjectChannel {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  updatedAgo: string;
  messages: SocialMessage[];
}

export interface DirectMessageThread {
  id: string;
  name: string;
  initials: string;
  role: string;
  online: boolean;
  updatedAgo: string;
  preview: string;
  messages: SocialMessage[];
}

// ─── Friends ─────────────────────────────────────────────

export const friends: Friend[] = [
  { name: "You", initials: "YO", online: true },
  { name: "Nia", initials: "NI", online: true },
  { name: "Dre", initials: "DR", online: false },
  { name: "Mia", initials: "MI", online: true },
];

// ─── Ideas ───────────────────────────────────────────────

export const ideas: Idea[] = [
  {
    id: "sneaker-app",
    name: "Sneaker Swap",
    emoji: "👟",
    description: "A place to buy, sell, and trade sneakers with people nearby.",
    friends: [friends[0], friends[1], friends[3]],
    vibe: "coming along",
    lastUpdate: "Project Manager just finished the product page",
    updatedAgo: "4 min ago",
  },
  {
    id: "church-site",
    name: "Grace Church Website",
    emoji: "⛪",
    description: "A simple website for our church with service times and events.",
    friends: [friends[1], friends[0]],
    vibe: "just started",
    lastUpdate: "Nia described what she wants on the homepage",
    updatedAgo: "12 min ago",
  },
  {
    id: "meal-planner",
    name: "Meal Prep Planner",
    emoji: "🥗",
    description: "Pick meals for the week and it makes a grocery list.",
    friends: [friends[3], friends[1]],
    vibe: "almost there",
    lastUpdate: "Mia added recipe photos",
    updatedAgo: "1 hr ago",
  },
];

export const buildArtifacts: BuildArtifact[] = [
  {
    id: "homepage",
    title: "Homepage",
    description: "Shows featured sneakers first, then a clean grid people can browse right away.",
    status: "done",
    updatedAgo: "2 min ago",
    changes: ["Featured hero", "Listing grid", "Simple top navigation"],
    code: `// homepage.jsx - built by Project Manager

export default function Home() {
  return (
    <main>
      <Hero title="Sneaker Swap" />
      <FeaturedGrid sneakers={featured} />
      <ListingGrid sneakers={all} />
    </main>
  )
}`,
    preview: {
      mode: "interface",
      artifactType: "Website",
      summary: "A polished browse-first landing experience with a hero, featured drops, and an immediately scannable catalog.",
      primaryActionLabel: "Open homepage preview",
      codeFileName: "homepage.tsx",
      views: [
        { id: "hero", label: "Hero", description: "First impression, brand tone, and featured drop framing." },
        { id: "browse", label: "Browse", description: "Grid density, filter clarity, and listing scan speed." },
      ],
      screens: [
        {
          id: "hero",
          label: "Hero",
          title: "Editorial homepage entry",
          note: "The homepage should make the product feel premium in the first five seconds and immediately show what people can do next.",
          accent: "from-neutral-950 via-stone-900 to-[#7a6342]",
          blocks: ["Brand headline", "Featured drop card", "Primary browse action"],
        },
        {
          id: "browse",
          label: "Browse",
          title: "Fast scan catalog",
          note: "The catalog view balances visual confidence with high-density scanning so first-time users do not need instruction.",
          accent: "from-[#1f3b5c] via-[#34618c] to-[#7ab1d9]",
          blocks: ["Filter rail", "Three-column listing grid", "Location and price cards"],
        },
      ],
    },
  },
  {
    id: "product-page",
    title: "Product page",
    description: "Each sneaker gets photos, price, details, and one clear action so nobody gets lost.",
    status: "done",
    updatedAgo: "6 min ago",
    changes: ["Photo gallery", "Price section", "Product details"],
    code: `// product-page.jsx - built by Project Manager

export default function Product({ sneaker }) {
  return (
    <main>
      <PhotoGallery photos={sneaker.photos} />
      <PriceTag amount={sneaker.price} />
      <OfferButton seller={sneaker.seller} />
    </main>
  )
}`,
    preview: {
      mode: "interface",
      artifactType: "Application screen",
      summary: "A product detail surface built to support both immediate purchase and negotiation without cognitive overload.",
      primaryActionLabel: "Open product screen",
      codeFileName: "product-page.tsx",
      views: [
        { id: "details", label: "Details", description: "Hero imagery, pricing, and trust-building structure." },
        { id: "decision", label: "Decision", description: "Buy now and make-an-offer hierarchy on the same screen." },
      ],
      screens: [
        {
          id: "details",
          label: "Details",
          title: "Product detail stack",
          note: "The page keeps photos, price, and seller context within one calm vertical decision zone.",
          accent: "from-stone-900 to-neutral-800",
          blocks: ["Photo gallery", "Price and size block", "Seller trust panel"],
        },
        {
          id: "decision",
          label: "Decision",
          title: "Action hierarchy",
          note: "Buy now remains primary while negotiation stays visible as a deliberate secondary path.",
          accent: "from-[#512f87] to-[#9b4acb]",
          blocks: ["Buy now button", "Make an offer action", "Delivery and authenticity notes"],
        },
      ],
    },
  },
  {
    id: "offer-flow",
    title: "Offer flow",
    description: "Buyers can send an offer, and the seller can accept or counter without leaving the page.",
    status: "building",
    updatedAgo: "Just now",
    changes: ["Offer button", "Offer form", "Seller response state"],
    code: `// offer-flow.jsx - built by Project Manager

export function OfferFlow() {
  return (
    <section>
      <OfferButton />
      <OfferSheet />
      <SellerResponseCard />
    </section>
  )
}`,
    preview: {
      mode: "flow",
      artifactType: "Workflow",
      summary: "A one-step buyer offer path that stays short for the buyer while giving the seller clear response states.",
      primaryActionLabel: "Run offer walkthrough",
      codeFileName: "offer-flow.tsx",
      views: [
        { id: "buyer", label: "Buyer path", description: "How the buyer starts, fills, and confirms the offer." },
        { id: "seller", label: "Seller path", description: "How the seller accepts, counters, or declines without leaving context." },
      ],
      flowSteps: [
        { id: "offer-buyer-1", title: "Open offer sheet", detail: "Buyer taps Make an Offer from the product page and keeps full product context.", state: "done", viewId: "buyer" },
        { id: "offer-buyer-2", title: "Set amount and note", detail: "One sheet handles the amount, optional note, and send action in a single step.", state: "active", viewId: "buyer" },
        { id: "offer-buyer-3", title: "Confirm and track state", detail: "Buyer sees a lightweight confirmation and the latest offer status without navigating away.", state: "next", viewId: "buyer" },
        { id: "offer-seller-1", title: "Receive negotiation card", detail: "Seller sees the buyer amount, note, and item context in a focused response card.", state: "done", viewId: "seller" },
        { id: "offer-seller-2", title: "Choose response", detail: "Accept, counter, or decline stays in one controlled decision surface.", state: "active", viewId: "seller" },
        { id: "offer-seller-3", title: "Return updated state", detail: "Both sides get a clean updated state instead of a branching workflow maze.", state: "next", viewId: "seller" },
      ],
    },
  },
  {
    id: "seller-automation",
    title: "Seller automation",
    description: "Routes incoming offers through guardrails, escalates exceptions, and keeps human review lightweight.",
    status: "building",
    updatedAgo: "9 min ago",
    changes: ["Offer routing", "Counter guardrails", "Escalation rules"],
    code: `// seller-automation.ts - built by Project Manager

export async function handleIncomingOffer(payload) {
  const riskProfile = scoreOffer(payload)
  if (riskProfile.requiresReview) return queueForReview(payload)
  return routeToSeller(payload)
}`,
    preview: {
      mode: "runtime",
      artifactType: "Automation",
      summary: "A live runtime view for systems that act in the background and should be understood through health, decisions, and recent events.",
      primaryActionLabel: "Run test payload",
      codeFileName: "seller-automation.ts",
      views: [
        { id: "health", label: "Health", description: "Current execution state, throughput, and queue pressure." },
        { id: "decisions", label: "Decisions", description: "Recent automation decisions, escalations, and rule hits." },
      ],
      runtimeMetrics: [
        { label: "Success rate", value: "98.4%", tone: "good", viewId: "health" },
        { label: "Avg. routing time", value: "420 ms", tone: "live", viewId: "health" },
        { label: "Pending reviews", value: "3", tone: "warn", viewId: "health" },
        { label: "Auto-approved", value: "14 offers", tone: "good", viewId: "decisions" },
        { label: "Escalated", value: "2 offers", tone: "warn", viewId: "decisions" },
        { label: "Counter suggestions", value: "5 prepared", tone: "live", viewId: "decisions" },
      ],
      runtimeEvents: [
        { id: "runtime-1", time: "09:14", label: "Offer routed", detail: "Offer #1842 sent straight to seller review with no guardrail flags.", viewId: "health" },
        { id: "runtime-2", time: "09:15", label: "Queue held", detail: "Offer #1848 paused because seller response timeout threshold was exceeded.", viewId: "health" },
        { id: "runtime-3", time: "09:16", label: "Counter suggested", detail: "System proposed a counter range based on recent size-10 Jordan negotiations.", viewId: "decisions" },
        { id: "runtime-4", time: "09:18", label: "Escalated to human", detail: "Offer #1851 moved to manual review after duplicate-payment risk signal.", viewId: "decisions" },
      ],
    },
  },
  {
    id: "offer-insights",
    title: "Offer insights feed",
    description: "A structured state view of offers, counters, timing, and negotiation confidence across the marketplace.",
    status: "done",
    updatedAgo: "7 min ago",
    changes: ["Offer snapshots", "Counter trends", "Risk flags"],
    code: `// offer-insights.ts - built by Project Manager

export function buildOfferInsightsFeed(records) {
  return records.map((record) => ({
    id: record.id,
    status: record.status,
    confidence: record.confidence,
    lastActionAt: record.lastActionAt,
  }))
}`,
    preview: {
      mode: "data",
      artifactType: "Data system",
      summary: "A data-first preview for outputs that are better understood as state, schema, and recent records than as screens.",
      primaryActionLabel: "Inspect latest snapshot",
      codeFileName: "offer-insights.ts",
      views: [
        { id: "snapshot", label: "Snapshot", description: "Latest live offer states across the system." },
        { id: "signals", label: "Signals", description: "Confidence and risk signals attached to each active negotiation." },
      ],
      dataColumns: [
        { key: "offer", label: "Offer" },
        { key: "status", label: "Status" },
        { key: "confidence", label: "Confidence" },
        { key: "nextAction", label: "Next action" },
      ],
      dataRows: [
        { viewId: "snapshot", offer: "#1842", status: "Awaiting seller", confidence: "High", nextAction: "Seller review" },
        { viewId: "snapshot", offer: "#1848", status: "Counter proposed", confidence: "Medium", nextAction: "Buyer response" },
        { viewId: "snapshot", offer: "#1851", status: "Manual review", confidence: "Low", nextAction: "Risk check" },
        { viewId: "signals", offer: "Price delta", status: "6.2% below ask", confidence: "Healthy", nextAction: "Allow counter" },
        { viewId: "signals", offer: "Repeat buyer", status: "4 successful trades", confidence: "High trust", nextAction: "Fast-path" },
        { viewId: "signals", offer: "Payment mismatch", status: "Flag raised", confidence: "Review needed", nextAction: "Escalate" },
      ],
    },
  },
];

export const projectBuildPlans: ProjectBuildPlan[] = [
  {
    id: "plan-sneaker-swap",
    projectId: "sneaker-app",
    prompt:
      "Build a clean sneaker marketplace website where people can browse featured shoes, sign in, and make offers without getting lost.",
    summary:
      "The build should feel premium and simple for non-technical users. Start with the homepage, account entry, and offer flow so the core experience is testable fast.",
    nextAction: "Confirm the account entry flow, then let the Project Manager finish the offer flow with final review states.",
    projectPreview: {
      eyebrow: "Full project preview",
      title: "Sneaker Swap core experience",
      subtitle: "A premium browse-to-offer flow with a simple homepage, calm sign in, and one clear offer path.",
      accent: "from-[#171717] via-[#252525] to-[#5a4a2d]",
      cards: ["Homepage", "Account entry", "Offer flow"],
    },
    buildOrder: [
      {
        id: "order-homepage-foundation",
        sequence: 1,
        title: "Start with the homepage foundation",
        summary: "Lock the first impression, browse path, and brand tone before touching any gated flows.",
        subprojectId: "sub-homepage",
        taskIds: ["home-hero", "home-grid", "home-polish"],
      },
      {
        id: "order-account-entry",
        sequence: 2,
        title: "Then build account entry",
        summary: "Once the browsing flow feels right, add sign-in and recovery so people can save progress without friction.",
        subprojectId: "sub-account",
        taskIds: ["account-sheet", "account-validation", "account-handoff"],
      },
      {
        id: "order-offer-flow",
        sequence: 3,
        title: "Finish with the offer loop",
        summary: "After the entry path is clear, connect the full buyer-to-seller offer experience and negotiation states.",
        subprojectId: "sub-offers",
        taskIds: ["offer-entry", "offer-sheet", "offer-response"],
      },
    ],
    subprojects: [
      {
        id: "sub-homepage",
        title: "Homepage",
        goal: "Give people instant trust and a fast way to browse the best sneakers first.",
        status: "done",
        updatedAgo: "2 min ago",
        agentName: "Sneaker Swap Core",
        agentBrief: "Uses the same product tone, layout rules, and project context as the rest of the build.",
        preview: {
          eyebrow: "Subproject preview",
          title: "A homepage that feels ready on first glance",
          subtitle: "Featured pairs, warm editorial spacing, and a browse path that does not require explanation.",
          accent: "from-neutral-950 via-stone-900 to-[#7a6342]",
          cards: ["Hero", "Featured drops", "Browse grid"],
        },
        tasks: [
          {
            id: "home-hero",
            title: "Write the hero and featured drop structure",
            status: "done",
            owner: "Project Manager",
            reviewer: "You",
            note: "Completed and approved. This establishes the visual tone for the whole site.",
            dueDate: "2026-03-20",
            startingPrompt: "Build a hero section for the Sneaker Swap homepage. It should feature a large headline, a subtitle about buying and selling sneakers locally, and a prominent call-to-action button. Below the hero, add a featured drops section showing 3-4 highlighted sneakers in a horizontal layout with images, names, and prices. Use a premium black and gold color palette.",
          },
          {
            id: "home-grid",
            title: "Build the browse grid with quick filters",
            status: "done",
            owner: "Project Manager",
            reviewer: "Nia",
            note: "Finished with simple card density so new users can scan products fast.",
            dueDate: "2026-03-21",
            startingPrompt: "Build a browse grid for the Sneaker Swap homepage that sits below the featured section. Each card should show a sneaker image, name, price, and seller location. Add simple filter chips at the top for brand, size, and condition. Keep the card layout clean and scannable so first-time users can browse quickly without feeling overwhelmed.",
          },
          {
            id: "home-polish",
            title: "Final homepage polish pass",
            status: "review",
            owner: "You",
            reviewer: "Nia",
            note: "Waiting on a final color and spacing check before it is marked fully locked.",
            dueDate: "2026-03-26",
            startingPrompt: "Do a final polish pass on the Sneaker Swap homepage. Review spacing, typography, and color consistency across the hero, featured drops, and browse grid. Make sure hover states feel smooth, the black-and-gold palette is consistent, and the page looks premium on both mobile and desktop. Flag anything that feels off.",
          },
        ],
      },
      {
        id: "sub-account",
        title: "Login and account entry",
        goal: "Make signing in feel lightweight so people can save favorites and manage offers without friction.",
        status: "review",
        updatedAgo: "9 min ago",
        agentName: "Sneaker Swap Core",
        agentBrief: "Carries the same shared context so account copy and behavior match the homepage and offer flow.",
        preview: {
          eyebrow: "Subproject preview",
          title: "Sign in without breaking the mood",
          subtitle: "One calm account entry sheet with only the fields people expect and clear recovery options.",
          accent: "from-[#2d1f1a] via-[#4a3028] to-[#906443]",
          cards: ["Email sign in", "Create account", "Forgot password"],
        },
        tasks: [
          {
            id: "account-sheet",
            title: "Design the sign in and create account sheet",
            status: "done",
            owner: "Project Manager",
            reviewer: "You",
            note: "The first pass is complete and ready for wording review.",
            dueDate: "2026-03-22",
            startingPrompt: "Build a sign-in and create-account sheet for Sneaker Swap. It should be a single modal-style overlay with two tabs: Sign In (email + password) and Create Account (name, email, password). Keep the design minimal and calm — no clutter. Use the project's black-and-gold palette and make sure the sheet doesn't interrupt the browsing mood.",
          },
          {
            id: "account-validation",
            title: "Add error, success, and recovery states",
            status: "review",
            owner: "Nick",
            reviewer: "Nick",
            note: "Needs review from Nick to confirm the recovery flow is clear enough for new users.",
            dueDate: "2026-03-27",
            startingPrompt: "Add validation states to the Sneaker Swap account sheet. Include inline error messages for invalid email and short passwords, a success state with a brief welcome message after sign-in, and a 'Forgot password' recovery flow that asks for email and shows a confirmation. Make error messages friendly and non-technical.",
          },
          {
            id: "account-handoff",
            title: "Connect account entry to saved offers",
            status: "planned",
            owner: "You",
            reviewer: "You",
            note: "This should start once the recovery flow is approved.",
            dueDate: "2026-03-29",
            startingPrompt: "Connect the Sneaker Swap account system to the offers feature. After a user signs in, they should see their saved offers and any active negotiations. If a user was browsing as a guest and had started an offer, link that offer to their new account after sign-in. Show a clean 'My Offers' section accessible from the navigation.",
          },
        ],
      },
      {
        id: "sub-offers",
        title: "Offer flow",
        goal: "Let buyers send offers and let sellers respond without either side losing context.",
        status: "building",
        updatedAgo: "Just now",
        agentName: "Offer Flow Specialist",
        agentBrief: "Specialized for offer states and negotiation logic, while still inheriting the full project brief.",
        preview: {
          eyebrow: "Subproject preview",
          title: "A one-path offer experience",
          subtitle: "People can make an offer, see status, and handle counters without a confusing multi-step checkout feel.",
          accent: "from-[#352a66] via-[#4d46b3] to-[#5fc3d6]",
          cards: ["Offer button", "Offer sheet", "Seller response"],
        },
        tasks: [
          {
            id: "offer-entry",
            title: "Add make-an-offer entry point on the product page",
            status: "done",
            owner: "Project Manager",
            reviewer: "Mia",
            note: "Live and already reflected in the current product build.",
            dueDate: "2026-03-23",
            startingPrompt: "Add a 'Make an Offer' button to each sneaker product page in Sneaker Swap. Place it prominently below the price as a secondary action alongside 'Buy Now'. The button should feel inviting, not aggressive. Use the project's warm premium styling and make sure it's obvious but doesn't compete with the buy button.",
          },
          {
            id: "offer-sheet",
            title: "Build the offer sheet with amount, note, and confirmation",
            status: "building",
            owner: "Project Manager",
            reviewer: "You",
            note: "In progress now. This is the next piece most likely to need feedback.",
            dueDate: "2026-03-25",
            startingPrompt: "Build the offer sheet that appears when a buyer clicks 'Make an Offer' on a Sneaker Swap product page. It should slide up as a bottom sheet with: an amount input (pre-filled near the listing price), an optional note field, and a 'Send Offer' confirmation button. Show the sneaker thumbnail and seller name for context. Keep it to one step — no multi-page flow.",
          },
          {
            id: "offer-response",
            title: "Create accept, counter, and declined states for sellers",
            status: "planned",
            owner: "You",
            reviewer: "Nick",
            note: "This opens once the offer sheet is approved.",
            dueDate: "2026-03-28",
            startingPrompt: "Build the seller response flow for Sneaker Swap offers. When a seller receives an offer, show a notification card with the buyer's offer amount, their note, and three actions: Accept, Counter, and Decline. If they counter, show a simple input for the new amount. Each state should have a clean confirmation screen. Keep all of this on one page — no navigation away.",
          },
        ],
      },
    ],
  },
];

// ─── Conversation (the core experience) ──────────────────

export const conversation: Message[] = [
  {
    id: "m1",
    from: "You",
    initials: "YO",
    text: "I want to build an app where people can buy and sell sneakers. Something really clean and easy to use.",
    time: "8:50 AM",
    isMine: true,
  },
  {
    id: "m2",
    from: "Project Manager",
    initials: "✦",
    text: "Love it! I'll start building that. First up: a homepage that shows featured sneakers. Give me a sec.",
    time: "8:51 AM",
    isAI: true,
    buildId: "homepage",
  },
  {
    id: "m3",
    from: "Nia",
    initials: "NI",
    text: "Ooh this is cool. Can the colors be more like black and gold? Super premium feeling.",
    time: "8:53 AM",
  },
  {
    id: "m4",
    from: "Project Manager",
    initials: "✦",
    text: "Done — switched to a black and gold look. Check the preview on the right. Want me to keep going with the product listings next?",
    time: "8:54 AM",
    isAI: true,
    buildId: "product-page",
  },
  {
    id: "m5",
    from: "Mia",
    initials: "MI",
    text: "Yes! And can people make offers instead of just buying at a set price?",
    time: "8:56 AM",
  },
  {
    id: "m6",
    from: "Project Manager",
    initials: "✦",
    text: "Great idea. I added an \"Make an offer\" button to each listing. The seller gets a notification and can accept or counter. Preview is updated!",
    time: "8:57 AM",
    isAI: true,
    buildId: "offer-flow",
  },
];

export const taskConversationThreads: TaskConversationThread[] = [
  {
    id: "thread-home-hero-core",
    taskId: "home-hero",
    subprojectId: "sub-homepage",
    subprojectTitle: "Homepage",
    title: "Homepage hero kickoff",
    agentName: "Sneaker Swap Core",
    updatedAgo: "18 min ago",
    summary: "Initial conversation about the homepage hero, featured drops, and premium direction.",
    messages: [
      {
        id: "thread-home-hero-core-m1",
        from: "You",
        initials: "YO",
        text: "Let's make the homepage feel premium right away. I want a hero that feels editorial, then featured drops underneath.",
        time: "8:12 AM",
        isMine: true,
      },
      {
        id: "thread-home-hero-core-m2",
        from: "Project Manager",
        initials: "✦",
        text: "Starting with a large statement hero, a warm black-and-gold tone, and a featured drops row so people understand the marketplace instantly.",
        time: "8:14 AM",
        isAI: true,
        buildId: "homepage",
      },
    ],
  },
  {
    id: "thread-home-grid-core",
    taskId: "home-grid",
    subprojectId: "sub-homepage",
    subprojectTitle: "Homepage",
    title: "Browse grid and filters",
    agentName: "Sneaker Swap Core",
    updatedAgo: "12 min ago",
    summary: "Focused on card layout density, filter chips, and scanning the grid quickly.",
    messages: [
      {
        id: "thread-home-grid-core-m1",
        from: "You",
        initials: "YO",
        text: "The browse grid needs to feel fast to scan. Keep the cards simple and make the filters obvious.",
        time: "8:22 AM",
        isMine: true,
      },
      {
        id: "thread-home-grid-core-m2",
        from: "Project Manager",
        initials: "✦",
        text: "I tightened the grid density, added quick filter chips for brand, size, and condition, and kept the visual weight low so first-time users do not get lost.",
        time: "8:26 AM",
        isAI: true,
      },
    ],
  },
  {
    id: "thread-home-polish-review",
    taskId: "home-polish",
    subprojectId: "sub-homepage",
    subprojectTitle: "Homepage",
    title: "Homepage polish review",
    agentName: "Sneaker Swap Core",
    updatedAgo: "6 min ago",
    summary: "Spacing, color balance, and hover-state review before locking the homepage.",
    messages: [
      {
        id: "thread-home-polish-review-m1",
        from: "Nia",
        initials: "NI",
        text: "The structure is good. I just want the spacing and hover states to feel more expensive before we call it done.",
        time: "8:41 AM",
        isMine: true,
      },
      {
        id: "thread-home-polish-review-m2",
        from: "Project Manager",
        initials: "✦",
        text: "I am doing a polish pass now: spacing rhythm, card hover softness, and making sure the gold accents stay controlled.",
        time: "8:43 AM",
        isAI: true,
      },
    ],
  },
  {
    id: "thread-account-sheet-core",
    taskId: "account-sheet",
    subprojectId: "sub-account",
    subprojectTitle: "Login and account entry",
    title: "Account sheet structure",
    agentName: "Sneaker Swap Core",
    updatedAgo: "20 min ago",
    summary: "Sign-in and create-account layout conversation for a calm entry flow.",
    messages: [
      {
        id: "thread-account-sheet-core-m1",
        from: "You",
        initials: "YO",
        text: "The sign in flow should feel lightweight. I want one calm sheet instead of a separate auth page.",
        time: "7:58 AM",
        isMine: true,
      },
      {
        id: "thread-account-sheet-core-m2",
        from: "Project Manager",
        initials: "✦",
        text: "I kept it to a single sheet with Sign In and Create Account tabs so the browsing mood stays intact.",
        time: "8:03 AM",
        isAI: true,
      },
    ],
  },
  {
    id: "thread-account-validation-review",
    taskId: "account-validation",
    subprojectId: "sub-account",
    subprojectTitle: "Login and account entry",
    title: "Validation and recovery states",
    agentName: "Recovery Agent",
    updatedAgo: "11 min ago",
    summary: "Error states, forgot password, and success confirmation wording.",
    messages: [
      {
        id: "thread-account-validation-review-m1",
        from: "Nick",
        initials: "NK",
        text: "Make sure the recovery flow is clear for people who are not technical. The copy matters here.",
        time: "8:19 AM",
        isMine: true,
      },
      {
        id: "thread-account-validation-review-m2",
        from: "Project Manager",
        initials: "✦",
        text: "I added inline validation, a short success state, and a simple password recovery confirmation so nothing feels alarming.",
        time: "8:21 AM",
        isAI: true,
      },
    ],
  },
  {
    id: "thread-offer-button-core",
    taskId: "offer-entry",
    subprojectId: "sub-offers",
    subprojectTitle: "Offer flow",
    title: "Make an offer entry point",
    agentName: "Sneaker Swap Core",
    updatedAgo: "14 min ago",
    summary: "Placement and styling for the offer button beside the main buying action.",
    messages: [
      {
        id: "thread-offer-button-core-m1",
        from: "Mia",
        initials: "MI",
        text: "People should be able to make an offer without the button fighting the Buy Now action.",
        time: "8:34 AM",
        isMine: true,
      },
      {
        id: "thread-offer-button-core-m2",
        from: "Project Manager",
        initials: "✦",
        text: "I placed Make an Offer right below the price as a clear secondary action. It stays visible but does not overpower the primary purchase path.",
        time: "8:36 AM",
        isAI: true,
        buildId: "product-page",
      },
    ],
  },
  {
    id: "thread-offer-sheet-agent",
    taskId: "offer-sheet",
    subprojectId: "sub-offers",
    subprojectTitle: "Offer flow",
    title: "Offer sheet conversation",
    agentName: "Offer Flow Agent",
    updatedAgo: "4 min ago",
    summary: "One-step sheet for amount, optional note, and clean send confirmation.",
    messages: [
      {
        id: "thread-offer-sheet-agent-m1",
        from: "You",
        initials: "YO",
        text: "I want the offer flow to stay on one sheet. Amount, optional note, then send. No extra steps.",
        time: "8:49 AM",
        isMine: true,
      },
      {
        id: "thread-offer-sheet-agent-m2",
        from: "Project Manager",
        initials: "✦",
        text: "Building a bottom sheet now with the sneaker context, amount field, note, and a single confirmation action.",
        time: "8:52 AM",
        isAI: true,
        buildId: "offer-flow",
      },
    ],
  },
  {
    id: "thread-offer-response-agent",
    taskId: "offer-response",
    subprojectId: "sub-offers",
    subprojectTitle: "Offer flow",
    title: "Seller response states",
    agentName: "Offer Flow Agent",
    updatedAgo: "2 min ago",
    summary: "Accept, counter, and decline flows with clear one-page state handling.",
    messages: [
      {
        id: "thread-offer-response-agent-m1",
        from: "Nick",
        initials: "NK",
        text: "The seller needs clear accept, counter, and decline actions without leaving the page.",
        time: "8:55 AM",
        isMine: true,
      },
      {
        id: "thread-offer-response-agent-m2",
        from: "Project Manager",
        initials: "✦",
        text: "I mapped the three response states into one notification card flow so the seller keeps context through every choice.",
        time: "8:57 AM",
        isAI: true,
      },
    ],
  },
];

// ─── File tree (repo browser) ────────────────────────────

export interface RepoFile {
  name: string;
  type: "file" | "folder";
  path: string;
  lastCommit: string;
  updatedAgo: string;
  children?: RepoFile[];
}

export interface Commit {
  id: string;
  message: string;
  author: string;
  authorInitials: string;
  time: string;
  files: string[];
}

export const repoTree: RepoFile[] = [
  {
    name: "src",
    type: "folder",
    path: "src",
    lastCommit: "Restructure project layout",
    updatedAgo: "2 min ago",
    children: [
      {
        name: "components",
        type: "folder",
        path: "src/components",
        lastCommit: "Add hero and featured grid",
        updatedAgo: "4 min ago",
        children: [
          { name: "Hero.jsx", type: "file", path: "src/components/Hero.jsx", lastCommit: "Build hero with black & gold palette", updatedAgo: "6 min ago" },
          { name: "FeaturedGrid.jsx", type: "file", path: "src/components/FeaturedGrid.jsx", lastCommit: "Add featured drops section", updatedAgo: "6 min ago" },
          { name: "ListingGrid.jsx", type: "file", path: "src/components/ListingGrid.jsx", lastCommit: "Build browse grid with quick filters", updatedAgo: "5 min ago" },
          { name: "OfferButton.jsx", type: "file", path: "src/components/OfferButton.jsx", lastCommit: "Add offer entry point on product page", updatedAgo: "3 min ago" },
          { name: "OfferSheet.jsx", type: "file", path: "src/components/OfferSheet.jsx", lastCommit: "WIP: offer sheet with amount input", updatedAgo: "Just now" },
          { name: "PhotoGallery.jsx", type: "file", path: "src/components/PhotoGallery.jsx", lastCommit: "Product photo gallery", updatedAgo: "6 min ago" },
          { name: "PriceTag.jsx", type: "file", path: "src/components/PriceTag.jsx", lastCommit: "Price section component", updatedAgo: "6 min ago" },
          { name: "AccountSheet.jsx", type: "file", path: "src/components/AccountSheet.jsx", lastCommit: "Sign in and create account sheet", updatedAgo: "9 min ago" },
        ],
      },
      {
        name: "pages",
        type: "folder",
        path: "src/pages",
        lastCommit: "Add offer flow page",
        updatedAgo: "Just now",
        children: [
          { name: "index.jsx", type: "file", path: "src/pages/index.jsx", lastCommit: "Homepage with hero and grids", updatedAgo: "2 min ago" },
          { name: "product.jsx", type: "file", path: "src/pages/product.jsx", lastCommit: "Product page with gallery and offer button", updatedAgo: "6 min ago" },
          { name: "login.jsx", type: "file", path: "src/pages/login.jsx", lastCommit: "Account entry flow", updatedAgo: "9 min ago" },
          { name: "offers.jsx", type: "file", path: "src/pages/offers.jsx", lastCommit: "WIP: offer flow page", updatedAgo: "Just now" },
        ],
      },
      {
        name: "styles",
        type: "folder",
        path: "src/styles",
        lastCommit: "Black and gold theme",
        updatedAgo: "8 min ago",
        children: [
          { name: "globals.css", type: "file", path: "src/styles/globals.css", lastCommit: "Premium black and gold palette", updatedAgo: "8 min ago" },
          { name: "theme.js", type: "file", path: "src/styles/theme.js", lastCommit: "Design tokens", updatedAgo: "8 min ago" },
        ],
      },
    ],
  },
  { name: "package.json", type: "file", path: "package.json", lastCommit: "Initial project setup", updatedAgo: "12 min ago" },
  { name: "next.config.js", type: "file", path: "next.config.js", lastCommit: "Initial project setup", updatedAgo: "12 min ago" },
  { name: "README.md", type: "file", path: "README.md", lastCommit: "Add project description", updatedAgo: "10 min ago" },
];

export const commits: Commit[] = [
  { id: "c8", message: "WIP: offer sheet with amount input", author: "Project Manager", authorInitials: "✦", time: "Just now", files: ["src/components/OfferSheet.jsx", "src/pages/offers.jsx"] },
  { id: "c7", message: "Add offer entry point on product page", author: "Project Manager", authorInitials: "✦", time: "3 min ago", files: ["src/components/OfferButton.jsx", "src/pages/product.jsx"] },
  { id: "c6", message: "Restructure project layout", author: "Project Manager", authorInitials: "✦", time: "4 min ago", files: ["src/pages/index.jsx"] },
  { id: "c5", message: "Build browse grid with quick filters", author: "Project Manager", authorInitials: "✦", time: "5 min ago", files: ["src/components/ListingGrid.jsx"] },
  { id: "c4", message: "Product page with gallery and offer button", author: "Project Manager", authorInitials: "✦", time: "6 min ago", files: ["src/pages/product.jsx", "src/components/PhotoGallery.jsx", "src/components/PriceTag.jsx"] },
  { id: "c3", message: "Build hero with black & gold palette", author: "Project Manager", authorInitials: "✦", time: "6 min ago", files: ["src/components/Hero.jsx", "src/components/FeaturedGrid.jsx"] },
  { id: "c2", message: "Premium black and gold palette", author: "Nia", authorInitials: "NI", time: "8 min ago", files: ["src/styles/globals.css", "src/styles/theme.js"] },
  { id: "c1", message: "Initial project setup", author: "You", authorInitials: "YO", time: "12 min ago", files: ["package.json", "next.config.js", "README.md"] },
];

// ─── Activity timeline ───────────────────────────────────

export interface ActivityEvent {
  id: string;
  type: "build" | "review" | "comment" | "status" | "deploy" | "join";
  title: string;
  description: string;
  actor: string;
  actorInitials: string;
  time: string;
  relatedFile?: string;
}

export const activityFeed: ActivityEvent[] = [
  { id: "a1", type: "build", title: "Offer sheet started", description: "Project Manager began building the offer sheet with amount input, note field, and confirmation flow.", actor: "Project Manager", actorInitials: "✦", time: "Just now", relatedFile: "src/components/OfferSheet.jsx" },
  { id: "a2", type: "build", title: "Offer button added", description: "Added the 'Make an Offer' entry point on each product page.", actor: "Project Manager", actorInitials: "✦", time: "3 min ago", relatedFile: "src/components/OfferButton.jsx" },
  { id: "a3", type: "review", title: "Account validation in review", description: "Nick is checking that the recovery flow is clear for new users.", actor: "Nick", actorInitials: "NK", time: "5 min ago" },
  { id: "a4", type: "comment", title: "Nia left feedback", description: "\"Can the colors be more like black and gold? Super premium feeling.\"", actor: "Nia", actorInitials: "NI", time: "8 min ago" },
  { id: "a5", type: "build", title: "Homepage completed", description: "Hero, featured drops, and browse grid all built and approved.", actor: "Project Manager", actorInitials: "✦", time: "10 min ago" },
  { id: "a6", type: "status", title: "Account sheet marked done", description: "Sign in and create account flow is complete and ready for review.", actor: "Project Manager", actorInitials: "✦", time: "12 min ago" },
  { id: "a7", type: "join", title: "Mia joined the project", description: "Mia was invited to collaborate on Sneaker Swap.", actor: "Mia", actorInitials: "MI", time: "15 min ago" },
  { id: "a8", type: "build", title: "Project created", description: "You started the Sneaker Swap project and described the initial vision.", actor: "You", actorInitials: "YO", time: "20 min ago" },
];

export const projectChannels: ProjectChannel[] = [
  {
    id: "channel-general",
    name: "General",
    description: "Fast coordination for the whole project.",
    memberCount: 4,
    updatedAgo: "2 min ago",
    messages: [
      { id: "general-1", from: "You", initials: "YO", text: "Let's keep the offer flow premium and very simple. No extra steps if we can avoid it.", time: "9:08 AM", isMine: true },
      { id: "general-2", from: "Nia", initials: "NI", text: "I can review the homepage polish pass after lunch.", time: "9:10 AM" },
      { id: "general-3", from: "Mia", initials: "MI", text: "The offer button placement already feels way better on the product page.", time: "9:12 AM" },
    ],
  },
  {
    id: "channel-offer-flow",
    name: "Offer Flow",
    description: "Coordination for buyer and seller negotiation states.",
    memberCount: 3,
    updatedAgo: "Just now",
    messages: [
      { id: "offer-1", from: "Project Manager", initials: "✦", text: "Offer sheet is in progress. Next step is tightening confirmation and seller response transitions.", time: "9:14 AM" },
      { id: "offer-2", from: "You", initials: "YO", text: "Good. Keep the sheet one step and avoid turning it into checkout.", time: "9:15 AM", isMine: true },
      { id: "offer-3", from: "Nick", initials: "NK", text: "I want to check the counter-offer language once that's ready.", time: "9:17 AM" },
    ],
  },
  {
    id: "channel-launch",
    name: "Launch Review",
    description: "Final checks before the first friend test.",
    memberCount: 4,
    updatedAgo: "9 min ago",
    messages: [
      { id: "launch-1", from: "Mia", initials: "MI", text: "We should do one pass on mobile spacing before sending this to friends.", time: "8:58 AM" },
      { id: "launch-2", from: "You", initials: "YO", text: "Agreed. I also want the messaging and PM flow to feel distinct before we share it.", time: "9:00 AM", isMine: true },
    ],
  },
];

export const directMessageThreads: DirectMessageThread[] = [
  {
    id: "dm-nia",
    name: "Nia",
    initials: "NI",
    role: "Design review",
    online: true,
    updatedAgo: "4 min ago",
    preview: "I'll review the gold accents and spacing rhythm.",
    messages: [
      { id: "dm-nia-1", from: "Nia", initials: "NI", text: "The homepage is close. I want one more pass on the hover softness.", time: "9:05 AM" },
      { id: "dm-nia-2", from: "You", initials: "YO", text: "That makes sense. I want it to feel expensive without being flashy.", time: "9:07 AM", isMine: true },
    ],
  },
  {
    id: "dm-mia",
    name: "Mia",
    initials: "MI",
    role: "Product feedback",
    online: true,
    updatedAgo: "11 min ago",
    preview: "The offer button feels balanced now.",
    messages: [
      { id: "dm-mia-1", from: "Mia", initials: "MI", text: "I like where the Make an Offer button landed. It feels clear but not pushy.", time: "8:56 AM" },
      { id: "dm-mia-2", from: "You", initials: "YO", text: "Perfect. That balance was exactly what I wanted.", time: "8:57 AM", isMine: true },
    ],
  },
  {
    id: "dm-nick",
    name: "Nick",
    initials: "NK",
    role: "Flow review",
    online: false,
    updatedAgo: "18 min ago",
    preview: "Let's review the recovery copy and seller response states.",
    messages: [
      { id: "dm-nick-1", from: "Nick", initials: "NK", text: "When the seller response states are ready, send them to me. I want to sanity-check the language.", time: "8:43 AM" },
      { id: "dm-nick-2", from: "You", initials: "YO", text: "Will do. I also want your eyes on the recovery flow wording.", time: "8:45 AM", isMine: true },
    ],
  },
];
