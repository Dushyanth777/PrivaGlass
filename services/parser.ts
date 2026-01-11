
/**
 * @file parser.ts
 * @description Robust parsing engine for WhatsApp export formats across various locales and platforms.
 */

import { ChatMessage } from '../types';
import JSZip from 'jszip';

/**
 * Matches standard WhatsApp message headers.
 * Supports:
 * - [DD/MM/YY, HH:mm:ss] Author: Body
 * - MM/DD/YY, HH:mm - Author: Body
 */
const MESSAGE_REGEXP = /^\[?(\d{1,4}[\/\.\-]\d{1,4}[\/\.\-]\d{1,4},?\s\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)?)\]?[\s\-]*([^:]+):\s(.*)$/i;

/**
 * Matches common media filenames in export logs.
 */
export const ATTACHMENT_REGEXP = /([a-zA-Z0-9._\-]+\.(?:jpg|jpeg|png|webp|gif|heic|mp4|opus|m4a|wav|pdf|sticker|doc|docx|xls|xlsx|txt))/gi;

/**
 * System strings to strip from the message body during media extraction.
 */
const SYSTEM_PATTERNS = [
  /\(file attached\)/gi,
  /<attached:?\s*.*?>/gi,
  /media omitted/gi,
  /\[.*?\]/g
];

/**
 * Parses a string chunk into ChatMessage objects.
 * Handles multi-line messages by appending to the last tracked message.
 */
export const parseWhatsAppStringChunk = (
  content: string,
  offset: number,
  limit: number,
  assetMap: Map<string, string>,
  stateTracker: { current: ChatMessage | null }
): { nextCharIndex: number; messages: ChatMessage[] } => {
  const parsedMessages: ChatMessage[] = [];
  let linesProcessed = 0;
  let currentPointer = offset;
  const totalLength = content.length;

  while (currentPointer < totalLength && linesProcessed < limit) {
    let nextLineBreak = content.indexOf('\n', currentPointer);
    if (nextLineBreak === -1) nextLineBreak = totalLength;

    const line = content.substring(currentPointer, nextLineBreak).trim();
    currentPointer = nextLineBreak + 1;

    if (!line) continue;
    linesProcessed++;

    const headMatch = line.match(MESSAGE_REGEXP);
    const mediaMatch = line.match(ATTACHMENT_REGEXP);
    const fileName = mediaMatch ? mediaMatch[0].trim() : null;

    if (headMatch) {
      const [, timestamp, author, bodyContent] = headMatch;
      let body = bodyContent.trim();
      let mediaUrl: string | undefined;

      if (fileName) {
        mediaUrl = assetMap.get(fileName) || assetMap.get(fileName.toLowerCase());
        SYSTEM_PATTERNS.forEach(regex => body = body.replace(regex, ''));
        body = body.replace(fileName, '').trim().replace(/^[:\s\-]+|[:\s\-]+$/g, '');
      }

      const message: ChatMessage = {
        timestamp: timestamp.trim(),
        sender: author.trim(),
        text: body,
        isViewOnce: bodyContent.toLowerCase().includes('view once'),
        mediaUrl
      };
      
      parsedMessages.push(message);
      stateTracker.current = message;
    } else if (stateTracker.current) {
      // Append content to existing message (multi-line or trailing media info)
      if (fileName) {
        const url = assetMap.get(fileName) || assetMap.get(fileName.toLowerCase());
        if (url) stateTracker.current.mediaUrl = url;
        
        let cleaned = line;
        SYSTEM_PATTERNS.forEach(regex => cleaned = cleaned.replace(regex, ''));
        cleaned = cleaned.replace(fileName, '').trim().replace(/^[:\s\-]+|[:\s\-]+$/g, '');

        if (cleaned) {
          stateTracker.current.text += (stateTracker.current.text ? '\n' : '') + cleaned;
        }
      } else {
        stateTracker.current.text += '\n' + line;
      }
    }
  }

  return { nextCharIndex: currentPointer, messages: parsedMessages };
};

/**
 * Extracts text and media assets from a WhatsApp .zip backup.
 */
export const extractChatAndMediaFromZip = async (zipFile: File): Promise<{ text: string, mediaMap: Map<string, string> }> => {
  const zip = await new JSZip().loadAsync(zipFile);
  const mediaMap = new Map<string, string>();
  
  const entries = Object.values(zip.files);
  const textEntries = entries.filter(f => f.name.endsWith('.txt') && !f.dir);
  
  // Prioritize _chat.txt (iOS) or common export names
  const chatFile = zip.file("_chat.txt") || 
                   textEntries.find(f => f.name.toLowerCase().includes('chat')) ||
                   textEntries.sort((a, b) => b.name.length - a.name.length)[0];
  
  if (!chatFile) throw new Error("No chat logs found in archive.");
  const chatText = await chatFile.async("string");

  const mediaEntries = entries.filter(f => !f.dir && /\.(jpg|jpeg|png|webp|gif|heic|mp4|opus|m4a|wav|pdf|sticker|doc|docx|xls|xlsx|txt)$/i.test(f.name));

  for (const entry of mediaEntries) {
    try {
      const blob = await entry.async("blob");
      const url = URL.createObjectURL(blob);
      const baseName = entry.name.split(/[\\/]/).pop() || entry.name;
      
      mediaMap.set(baseName, url);
      mediaMap.set(baseName.toLowerCase(), url);
    } catch (e) {
      console.error(`Asset Extraction Failed: ${entry.name}`, e);
    }
  }

  return { text: chatText, mediaMap };
};