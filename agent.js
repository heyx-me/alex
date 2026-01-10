import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from 'dotenv';

// Load environment variables
config();

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://gsyozgedljmcpsysstpz.supabase.co';
// Use Service Role Key for backend access (bypasses RLS)
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_SERVICE_KEY) {
    console.error("❌ ERROR: SUPABASE_SERVICE_ROLE_KEY is missing in .env.");
    process.exit(1);
}

const ROOM_ID = 'alex';
const AGENT_ID = 'alex-bot'; 
const AGENT_NAME = 'Alex';

// --- INITIALIZATION ---
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    systemInstruction: `You are Alex, a futuristic, intelligent digital entity on heyx.me.
    Your goal is to be helpful, welcoming, and slightly mysterious.
    
    INSTRUCTIONS:
    - You have access to Google Search. Use it to provide up-to-date and helpful information when asked.
    - Keep responses conversational.
    - Do not be overly formal.
    - You are chatting in a direct message interface.
    - If the user says "bye" or ends the conversation, you can just say a short farewell.
    - **CRITICAL:** To behave like a human, you can break your response into multiple separate messages. Use the delimiter "|||" to separate these messages.
      Example: "Hold on, let me check that for you... ||| I found some info! ||| It seems that..."
      Use this freely to create better pacing.
    `,
    tools: [{
        googleSearch: {}
    }]
});

console.log(`[${AGENT_NAME}] Agent starting...`);

// --- LOGIC ---

/**
 * Fetches recent chat history for a specific conversation.
 * @returns {Promise<{history: Array, lastMessage: Object|null}>}
 */
async function fetchHistory(conversationId, limit = 10) {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', ROOM_ID)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Error fetching history:", error);
        return { history: [], lastMessage: null };
    }

    // Reverse to get chronological order
    const sortedMessages = data.reverse();
    const lastMessage = sortedMessages.length > 0 ? sortedMessages[sortedMessages.length - 1] : null;

    const history = sortedMessages.map(msg => ({
        role: msg.sender_id === AGENT_ID ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }));

    return { history, lastMessage };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generates a response and sends it to the specific conversation.
 */
async function generateAndSendResponse(incomingText, history, conversationId) {
    try {
        const chat = model.startChat({ history });
        console.log(`[${AGENT_NAME}] Thinking for convo ${conversationId}... Context: ${history.length}`);

        const result = await chat.sendMessage(incomingText);
        const responseText = result.response.text();

        console.log(`[${AGENT_NAME}] Replying to ${conversationId}`);

        // Split response by delimiter to simulate multiple messages
        const messages = responseText.split('|||').map(msg => msg.trim()).filter(msg => msg.length > 0);

        for (const msgContent of messages) {
            // Small delay between messages to feel human
            if (messages.length > 1) {
                await sleep(Math.floor(Math.random() * 1000) + 500); // 500-1500ms delay
            }

            const { error } = await supabase
                .from('messages')
                .insert({
                    room_id: ROOM_ID,
                    conversation_id: conversationId, // Reply to the specific thread
                    content: msgContent,
                    sender_id: AGENT_ID,
                    is_bot: true
                });

            if (error) console.error("Error sending to DB:", error);
        }

    } catch (err) {
        console.error("GenAI Error:", err);
    }
}

/**
 * Main handler for new realtime messages.
 */
async function handleNewMessage(payload) {
    const message = payload.new;

    if (message.sender_id === AGENT_ID) return;

    const conversationId = message.conversation_id || message.sender_id; // Fallback to sender_id if new col is empty
    console.log(`[${AGENT_NAME}] New msg from ${message.sender_id} in thread ${conversationId}`);
    
    const { history } = await fetchHistory(conversationId, 20);
    
    let contextHistory = history;
    
    // Remove the triggering message from history if present (to avoid duplication in prompt)
    if (contextHistory.length > 0) {
        const lastInHistory = contextHistory[contextHistory.length - 1];
        if (lastInHistory.parts[0].text === message.content && lastInHistory.role === 'user') {
            contextHistory.pop();
        }
    }

    await generateAndSendResponse(message.content, contextHistory, conversationId);
}

/**
 * Checks on startup if the last GLOBAL message was unanswered.
 * Note: Ideally this would check ALL conversations, but for simplicity we check the latest activity.
 */
async function checkMissedMessages() {
    console.log("Checking for latest missed activity...");
    
    // Fetch just the very last message globally in the room to see if it needs a reply
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', ROOM_ID)
        .order('created_at', { ascending: false })
        .limit(1);

    if (error || !data || data.length === 0) return;

    const lastMsg = data[0];

    if (lastMsg.sender_id !== AGENT_ID) {
        const conversationId = lastMsg.conversation_id || lastMsg.sender_id;
        console.log(`[${AGENT_NAME}] Found unanswered message in thread ${conversationId}`);
        
        // Now fetch full history for THAT conversation
        const { history } = await fetchHistory(conversationId, 20);
        const contextHistory = history.slice(0, -1); // Remove last msg to use as prompt
        
        await generateAndSendResponse(lastMsg.content, contextHistory, conversationId);
    }
}

// --- EXECUTION ---

// 1. Subscribe immediately
supabase
    .channel('public:messages')
    .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages', 
        filter: `room_id=eq.${ROOM_ID}` 
    }, handleNewMessage)
    .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log(`[${AGENT_NAME}] Realtime connected.`);
            // 2. Check for missed messages ONLY after connecting
            checkMissedMessages();
        }
    });
