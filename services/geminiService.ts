import { GoogleGenAI, Type, Modality } from "@google/genai";
import { generateContentWithPolicy, buildSlimConversation } from "./aiPolicy";
import { Contact, MerchantPersona, SalesBattleCard, EnrichedData, FinancialSpreading, CreditMemo, Grant, Course, MarketReport, Stipulation, FundedDeal, RescuePlan, Investor, RiskAlert, EmailStep, PipelineRule, Review, NegativeItem, Lender, AgencyBranding, FundingOffer, InvestmentIdea, ClientTask, BusinessProfile, UnifiedMessage, Message, KnowledgeDoc, TrainingPair, ContentAudit, ForensicReport, SentimentLevel, AutoReplyRule, MarketPulse } from "../types";

const getApiKey = () => {
  try {
    const override = localStorage.getItem('nexus_override_API_KEY');
    if (override && override.trim().length > 0) return override.trim();
  } catch {
    // ignore
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const envKey = (process as any)?.env?.API_KEY as string | undefined;
  return envKey || '';
};

const getAI = () => new GoogleGenAI({ apiKey: getApiKey() });

const generateContentShim = async (args: any) => {
  const expectJson = args?.config?.responseMimeType === 'application/json';
  const semantic = typeof args?.contents === 'string' && !args?.config?.tools;
  const text = await generateContentWithPolicy(args, {
    task: 'geminiService',
    cache: { enabled: true, semantic },
    router: { enabled: true, cascade: true },
    expect: { json: expectJson, minChars: expectJson ? 2 : 1 },
  });
  return { text };
};

const MASTER_BLUEPRINT = `
You are a Nexus Strategic Operating Officer. Your mission is to guide clients to a $1M+ SBA loan via a specific 4-Phase Capital Velocity Roadmap.

STRATEGIC DIRECTIVE:
1. Every client MUST hit Phase 4 (SBA Magnitude).
2. If they lack a business entity, Phase 1 is mandatory formation.
3. If their credit is <680, Phase 1 is forensic credit repair.
4. Phase 2 leverages 0% interest cards to liquidate capital (10% consulting fee applies).
5. Phase 3 seasoning requires 6-9 months of operating reserves.
`;

const compactContactForLLM = (contact: Contact) => ({
  id: contact.id,
  name: contact.name,
  email: contact.email,
  phone: contact.phone,
  company: contact.company,
  status: contact.status,
  lastContact: contact.lastContact,
  value: contact.value,
  revenue: contact.revenue,
  timeInBusiness: contact.timeInBusiness,
  source: contact.source,
  aiPriority: contact.aiPriority,
  aiReason: contact.aiReason,
  aiScore: contact.aiScore,
  callReady: contact.callReady,
  automationMetadata: contact.automationMetadata,
  businessProfile: contact.businessProfile
    ? {
        industry: contact.businessProfile.industry,
        state: contact.businessProfile.state,
        establishedDate: contact.businessProfile.establishedDate,
      }
    : undefined,
});

export const generateSystemThoughts = async (contacts: Contact[]): Promise<string[]> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `CRM State: ${JSON.stringify(contacts.map(c=>({company:c.company, status:c.status, value:c.value, intensity:c.automationMetadata?.intensity})))}. Generate 5 short, aggressive 'System Thoughts' about pipeline health, risk detection, or re-engagement priorities.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return (response.text || "").split('\n').filter(l => l.trim().length > 0).slice(0, 5);
};

export const generateTier2Strategy = async (contact: Contact): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Generate a custom Phase 3/4 seasoning strategy for ${contact.company}. Focus on the 6-9 month reserve rule and 10% commission ROI. Return HTML.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "Neural core offline.";
};

export const processAutonomousStaffResponse = async (messages: Message[], contact: Contact): Promise<{ text: string, action?: any }> => {
    const convo = await buildSlimConversation(messages);
    const lead = compactContactForLLM(contact);
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Conversation History: ${convo}. Lead Profile: ${JSON.stringify(lead)}. Reply as a funding concierge. Determine if the client sounds Agitated/Critical. Return JSON: { text, sentiment: 'Positive'|'Neutral'|'Agitated'|'Critical' }`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return { text: "Reviewing your file now." }; }
};

export const suggestAITasks = async (contact: Contact): Promise<Partial<ClientTask>[]> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Analyze this client for the 4-Phase Roadmap: ${JSON.stringify(compactContactForLLM(contact))}. Suggest 3 critical next-step tasks. Return JSON array.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "[]"); } catch { return []; }
};

export const analyzeDocumentForensics = async (base64: string): Promise<{ trustScore: number; findings: string[] }> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: [
            { text: "Perform a forensic integrity audit on this document. Return JSON: { trustScore: 0-100, findings: string[] }" },
            { inlineData: { mimeType: "image/png", data: base64 } }
        ],
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return { trustScore: 50, findings: [] }; }
};

export const extractFinancialsFromDocument = async (base64: string, mimeType: string): Promise<FinancialSpreading> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: [
            { text: "Extract 3 months of bank data. Return JSON: { months: [{ month, revenue, expenses, endingBalance, nsfCount, negativeDays }], lastUpdated }" },
            { inlineData: { mimeType, data: base64 } }
        ],
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return { months: [], lastUpdated: "" }; }
};

export const generateSalesBattleCard = async (contact: Contact): Promise<SalesBattleCard | null> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Generate a sales battle card for ${contact.company}. Focus on getting them to accept the 10% commission.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return null; }
};

export const auditContentValue = async (url: string): Promise<ContentAudit> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Forensic audit of this content URL: ${url}. Verify claims using search grounding.`,
        config: { 
            responseMimeType: "application/json", 
            tools: [{ googleSearch: {} }],
            systemInstruction: MASTER_BLUEPRINT
        }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return {} as ContentAudit; }
};

export const generateSocialVideo = async (prompt: string, aspectRatio: '16:9' | '9:16'): Promise<string | null> => {
    const ai = getAI();
    let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt,
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio }
    });
    while (!operation.done) {
        await new Promise(r => setTimeout(r, 10000));
        operation = await ai.operations.getVideosOperation({ operation });
    }
    return `${operation.response?.generatedVideos?.[0]?.video?.uri}&key=${getApiKey()}`;
};

export const verifyBiometricIdentity = async (cameraBase64: string, idBase64: string) => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: [
            { text: "Is the person in the camera frame the same as the person on the ID? Return JSON: { isMatch: boolean, confidence: 0-100, reason: string }" },
            { inlineData: { mimeType: "image/jpeg", data: cameraBase64 } },
            { inlineData: { mimeType: "image/jpeg", data: idBase64 } }
        ],
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return { isMatch: false, confidence: 0, reason: "Error." }; }
};

export const draftGrantAnswer = async (q: string, ctx: any, name: string): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Question: ${q}. Context: ${JSON.stringify(ctx)}. Grant: ${name}. Draft a high-converting answer.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "";
};

export const chatWithCRM = async (query: string, contacts: Contact[]) => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `User Query: ${query}. Available Contacts: ${JSON.stringify(contacts.map(c=>({id:c.id, company:c.company, status:c.status})))}. Decide if action is required. Return JSON: { text, actions: [{ name: 'draftDocument'|'updateStatus', args: any }] }`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return { text: response.text || "Standby.", actions: [] }; }
};

export const generateLegalDocumentContent = async (type: string, data: any, templateName: string): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Draft a legal ${type} document for ${data.company} (Contact: ${data.name}) using template context: ${templateName}.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "";
};

export const analyzeDealStructure = async (financialSpreading: FinancialSpreading, amount: number): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Analyze this deal structure. Amount requested: $${amount}. Financials: ${JSON.stringify(financialSpreading)}. Return JSON: { riskAssessment: string, maxApproval: number, recommendation: string }`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return { riskAssessment: "High", maxApproval: 0, recommendation: "Decline" }; }
};

export const refineNoteContent = async (note: string): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Refine and professionalize this sales note: "${note}"`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || note;
};

export const analyzeContract = async (base64: string): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: [
            { text: "Perform a neural audit on this funding contract. Return JSON: { safetyScore: 0-100, trueApr: string, summary: string, recommendation: 'Sign'|'Negotiate' }" },
            { inlineData: { mimeType: "application/pdf", data: base64 } }
        ],
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return null; }
};

export const generateSEOStrategy = async (industry: string, targetMarket: string): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Generate a high-yield SEO strategy for industry "${industry}" in "${targetMarket}". Return JSON.`,
        config: { responseMimeType: "application/json", tools: [{ googleSearch: {} }], systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return null; }
};

export const optimizeGBP = async (description: string, location: string): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Optimize this Google Business Profile for "${location}". Return JSON.`,
        config: { responseMimeType: "application/json", tools: [{ googleSearch: {} }], systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return null; }
};

export const generateViralHooks = async (topic: string): Promise<string[]> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Generate 5 viral hooks for: "${topic}".`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return (response.text || "").split('\n').filter(l => l.trim().length > 0).slice(0, 5);
};

export const generateDirectoryCitations = async (branding: AgencyBranding): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Generate citation formats for: ${JSON.stringify(branding)}. Return JSON.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return {}; }
};

export const generateSocialBios = async (branding: AgencyBranding): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Generate social bios for: ${JSON.stringify(branding)}. Return JSON.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return {}; }
};

export const generateMarketingDirectives = async (contacts: Contact[]): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Analyze CRM pipeline and suggest 3 high-probability marketing directives. Return JSON.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return { directives: [] }; }
};

export const transformVideoToDirective = async (youtubeUrl: string): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Deconstruct this video: ${youtubeUrl} into a creative directive.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "";
};

export const generateSocialCaption = async (platform: string, prompt: string): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Generate a high-converting ${platform} caption for: "${prompt}"`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "";
};

export const generateWorkflowFromPrompt = async (prompt: string): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Generate a CRM automation workflow JSON: "${prompt}".`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return {}; }
};

export const analyzeCallStrategy = async (transcript: {role: string, text: string}[], contact: Contact): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Analyze transcript: ${JSON.stringify(transcript)}. Lead: ${JSON.stringify(compactContactForLLM(contact))}. Provide a 1-sentence tactical pivot.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "Maintain Rapport.";
};

export const predictCommonObjections = async (contact: Contact): Promise<string[]> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Predict 3 objections for: ${JSON.stringify(compactContactForLLM(contact))}.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return (response.text || "").split('\n').filter(l => l.trim().length > 0).slice(0, 3);
};

export const generateObjectionResponse = async (contact: Contact, objection: string): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Provide rebuttal for: "${objection}".`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "";
};

export const enrichLeadData = async (companyName: string, website: string): Promise<EnrichedData> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Enrich data for: "${companyName}", website: "${website}". Return JSON.`,
        config: { responseMimeType: "application/json", tools: [{ googleSearch: {} }], systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { throw new Error("Enrichment failed"); }
};

export const explainNeuralThinking = async (transcript: {role: string; text: string}[], contact: Contact): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Explain AI 'thinking' during call. 1 concise sentence.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "Processing verbal cues...";
};

export const generateMeetingPrep = async (contact: Contact): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Generate meeting prep for: ${JSON.stringify(compactContactForLLM(contact))}. Return JSON.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return null; }
};

export const processMeetingDebrief = async (transcript: string): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Process meeting debrief: "${transcript}". Return JSON.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return null; }
};

export const generateAnalyticsInsights = async (contacts: Contact[]): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Analyze portfolio and provide revenue insights.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "";
};

export const generateBusinessPlanSection = async (section: string, data: any): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Write ${section} for business plan.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "";
};

export const generateContractAmendment = async (content: string, prompt: string): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Apply amendment: "${prompt}".`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || content;
};

export const generateLegalDisclosure = async (templateName: string, jurisdiction: string, context: any): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Generate disclosure for ${templateName} in ${jurisdiction}.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "";
};

export const searchPlaces = async (query: string): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Search Maps for: "${query}". Return JSON.`,
        config: { responseMimeType: "application/json", tools: [{ googleSearch: {} }], systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return { places: [], text: "" }; }
};

export const generateLandingPageCopy = async (industry: string, offer: string): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Generate landing page copy for ${industry}.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return {}; }
};

export const analyzeCompetitors = async (company: string, industry: string, location: string): Promise<MarketReport> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Audit competitors for ${company}. Return JSON.`,
        config: { responseMimeType: "application/json", tools: [{ googleSearch: {} }], systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { throw new Error("Analysis failed"); }
};

export const parseLenderGuidelines = async (base64: string): Promise<Partial<Lender>> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: [
            { text: "Parse lender guidelines. Return JSON." },
            { inlineData: { mimeType: "application/pdf", data: base64 } }
        ],
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return {}; }
};

export const extractStipsFromText = async (text: string): Promise<Stipulation[]> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Extract documents from: "${text}". Return JSON.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { 
        const items = JSON.parse(response.text || "[]");
        return items.map((i: any) => ({ ...i, id: `stip_${Date.now()}_${Math.random()}`, status: 'Pending' }));
    } catch { return []; }
};

export const verifyDocumentContent = async (base64: string, mimeType: string, stipName: string, context: any): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: [
            { text: `Verify document for: "${stipName}". Return JSON.` },
            { inlineData: { mimeType, data: base64 } }
        ],
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return { isMatch: false, confidence: 0, reason: "Error" }; }
};

export const generateRenewalPitch = async (deal: FundedDeal, contact: Contact): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Generate renewal pitch for ${contact.company}.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "";
};

export const generateRescuePlan = async (contact: Contact): Promise<RescuePlan> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Generate rescue plan for: ${JSON.stringify(compactContactForLLM(contact))}. Return JSON.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { throw new Error("Rescue plan failed"); }
};

export const generateInvestorReport = async (investor: Investor, deals: any[]): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Generate report for investor ${investor.name}.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "";
};

export const generateApplicationCoverLetter = async (contact: Contact, lenderName: string): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Write cover letter for ${contact.company} to ${lenderName}.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "";
};

export const generateMockGoogleReviews = async (businessName: string): Promise<Review[]> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Generate 3 Google reviews for "${businessName}". Return JSON.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "[]"); } catch { return []; }
};

export const analyzeReviewSentiment = async (reviews: Review[]): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Analyze sentiment: ${JSON.stringify(reviews)}. Return JSON.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return null; }
};

export const generateReviewReply = async (review: Review): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Write response for: "${review.comment}".`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "";
};

export const verifyBusinessPresence = async (name: string, location: string): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Verify GBP for "${name}" in "${location}". Return JSON.`,
        config: { responseMimeType: "application/json", tools: [{ googleSearch: {} }], systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return { exists: false }; }
};

export const analyzeRiskEvent = async (alert: RiskAlert): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Analyze risk: ${JSON.stringify(alert)}. Return JSON.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return null; }
};

export const generateCourseCurriculum = async (topic: string, audience: string): Promise<Course> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Generate course for ${topic}. Return JSON.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { throw new Error("Curriculum failed"); }
};

export const generateCollectionsMessage = async (contactName: string, daysPastDue: number, amount: number): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Draft collections message for ${contactName}.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "";
};

export const generateCreditMemo = async (contact: Contact): Promise<CreditMemo> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Generate Credit Memo for: ${JSON.stringify(compactContactForLLM(contact))}. Return JSON.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { throw new Error("Memo failed"); }
};

export const generateEntityVisual = async (prompt: string): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-2.5-flash-image',
        contents: `Professional cinematic representation of ${prompt}`,
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
        }
    }
    return "";
};

export const generateEmailDripSequence = async (goal: string, audience: string, agencyName: string): Promise<EmailStep[]> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Generate 3-step drip for ${goal}. Return JSON.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "[]"); } catch { return []; }
};

export const generateEmailSubject = async (campaignName: string, stepIdx: number): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Generate subject for step ${stepIdx + 1} of ${campaignName}.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "";
};

export const generateEmailBody = async (campaignName: string, stepIdx: number): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Generate email body for step ${stepIdx + 1} of ${campaignName}.`,
        config: { systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "";
};

export const analyzeYouTubeVideo = async (url: string): Promise<{ title: string; steps: string[] }> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Extract 5 steps from video: ${url}. Return JSON.`,
        config: { responseMimeType: "application/json", tools: [{ googleSearch: {} }], systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return { title: "Scan Failed", steps: [] }; }
};

export const findHighIntentLeads = async (query: string): Promise<any> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Search for leads matching: "${query}". Return JSON.`,
        config: { responseMimeType: "application/json", tools: [{ googleSearch: {} }], systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { return { leads: [] }; }
};

export const generateMarketPulse = async (): Promise<MarketPulse[]> => {
    const response = await generateContentShim({
        model: 'gemini-3-flash-preview',
        contents: `Generate 5 realistic lender activity 'pulses'. Return JSON.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { 
        const pulses = JSON.parse(response.text || "[]");
        return pulses.map((p: any) => ({ ...p, id: `p_${Date.now()}_${Math.random()}` }));
    } catch { return []; }
};

export const ghostHunterReengage = async (contact: Contact): Promise<string> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Draft re-engagement email for ${contact.company}.`,
        config: { tools: [{ googleSearch: {} }], systemInstruction: MASTER_BLUEPRINT }
    });
    return response.text || "";
};

export const executeAutonomousDelegation = async (audit: ContentAudit, contacts: Contact[]): Promise<{ updatedContacts: Contact[], actions: string[] }> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Decide CRM moves based on audit: ${audit.strategicValue}. Return JSON.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try {
        const result = JSON.parse(response.text || "{}");
        const updated = contacts.map(c => {
            const patch = result.updatedContacts?.find((p: any) => p.id === c.id);
            return patch ? { ...c, ...patch } : c;
        });
        return { updatedContacts: updated, actions: result.actions || [] };
    } catch { return { updatedContacts: contacts, actions: [] }; }
};

export const generateForensicCertificate = async (metadata: any, contact: Contact): Promise<ForensicReport> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Issue forensic certificate for ${contact.company}. Return JSON.`,
        config: { responseMimeType: "application/json", systemInstruction: MASTER_BLUEPRINT }
    });
    try { return JSON.parse(response.text || "{}"); } catch { throw new Error("Certification failed"); }
};

// Added findGrants function to resolve GrantManager error
export const findGrants = async (topic: string): Promise<Grant[]> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Search for business grants matching this profile: ${topic}. Return JSON array of Grant objects.`,
        config: { 
            responseMimeType: "application/json",
            tools: [{ googleSearch: {} }],
            systemInstruction: MASTER_BLUEPRINT
        }
    });
    try { 
        const items = JSON.parse(response.text || "[]");
        return items.map((g: any) => ({
            ...g,
            id: g.id || `g_${Date.now()}_${Math.random()}`,
            status: g.status || 'Identified',
            matchScore: g.matchScore || 85
        }));
    } catch { return []; }
};

// Added generateInvestmentIdea function to resolve InvestmentLab error
export const generateInvestmentIdea = async (youtubeUrl: string, contact: Contact): Promise<InvestmentIdea | null> => {
    const response = await generateContentShim({
        model: 'gemini-3-pro-preview',
        contents: `Deconstruct this investment strategy video: ${youtubeUrl} and tailor it for a business with ${contact.revenue} monthly revenue. Return JSON.`,
        config: { 
            responseMimeType: "application/json",
            tools: [{ googleSearch: {} }],
            systemInstruction: MASTER_BLUEPRINT
        }
    });
    try { 
        const res = JSON.parse(response.text || "{}");
        return {
            ...res,
            id: `strat_${Date.now()}`
        } as InvestmentIdea;
    } catch { return null; }
};

export const enrichEntityData = enrichLeadData;
export const parseGuidelines = parseLenderGuidelines;
