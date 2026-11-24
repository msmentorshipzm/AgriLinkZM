import React, { useEffect, useRef, useState } from 'react';
import {
  CreditCard,
  ImagePlus,
  MessageSquare,
  Mic,
  Send,
  Square,
  X,
} from 'lucide-react';
import type { ChatConversation, ChatMessage, UserAccount } from '../types/marketplace.ts';
import type { PendingPaymentStatus } from '../utils/billingNotifications.ts';
import { formatZMW } from '../utils/marketplaceRules.ts';

interface MessagingDrawerProps {
  isOpen: boolean;
  currentUser: UserAccount;
  conversations: ChatConversation[];
  messages: ChatMessage[];
  activeConversationId: string | null;
  pendingPaymentStatus?: PendingPaymentStatus | null;
  onSelectConversation: (convId: string) => void;
  onClose: () => void;
  onSendMessage: (payload: {
    conversationId: string;
    type: 'text' | 'image' | 'voice';
    text?: string;
    mediaDataUrl?: string;
    audioDurationSec?: number;
  }) => Promise<string | null>;
  onWhatsAppHandoff: (conversationId: string) => Promise<{
    whatsappUrl?: string;
    error?: string;
    requiresBuyerFee?: boolean;
  }>;
  onOpenBuyerFeeCheckout: () => void;
  onOpenPaymentCheckout?: (paymentType: 'advertiser_subscription' | 'buyer_account_fee') => void;
}

async function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 900;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => resolve(String(reader.result));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

export const MessagingDrawer: React.FC<MessagingDrawerProps> = ({
  isOpen,
  currentUser,
  conversations,
  messages,
  activeConversationId,
  pendingPaymentStatus,
  onSelectConversation,
  onClose,
  onSendMessage,
  onWhatsAppHandoff,
  onOpenBuyerFeeCheckout,
  onOpenPaymentCheckout,
}) => {
  const [textInput, setTextInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsBuyerFee, setNeedsBuyerFee] = useState(false);
  const [handoffBanner, setHandoffBanner] = useState<string | null>(null);

  // Voice Note recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  const myConversations = conversations
    .filter((c) => c.buyerId === currentUser.id || c.sellerId === currentUser.id)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const selectedConv =
    myConversations.find((c) => c.id === activeConversationId) || myConversations[0] || null;

  const threadMessages = selectedConv
    ? messages
        .filter((m) => m.conversationId === selectedConv.id)
        .sort((a, b) => a.createdAt - b.createdAt)
    : [];

  useEffect(() => {
    if (isOpen) {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, threadMessages.length, selectedConv?.id]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConv || !textInput.trim()) return;
    setErrorMsg(null);
    setSending(true);
    const err = await onSendMessage({
      conversationId: selectedConv.id,
      type: 'text',
      text: textInput.trim(),
    });
    setSending(false);
    if (err) {
      setErrorMsg(err);
    } else {
      setTextInput('');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConv) return;
    setErrorMsg(null);
    setSending(true);
    try {
      const dataUrl = await compressImageFile(file);
      const err = await onSendMessage({
        conversationId: selectedConv.id,
        type: 'image',
        text: file.name,
        mediaDataUrl: dataUrl,
      });
      if (err) setErrorMsg(err);
    } catch {
      setErrorMsg('Failed to process image attachment.');
    } finally {
      setSending(false);
      e.target.value = '';
    }
  };

  const handleStartRecording = async () => {
    if (!selectedConv) return;
    setErrorMsg(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorMsg('Voice recording is not supported in this browser environment.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = async () => {
          if (typeof reader.result === 'string') {
            await onSendMessage({
              conversationId: selectedConv.id,
              type: 'voice',
              audioDurationSec: Math.max(1, recordSeconds),
              mediaDataUrl: reader.result,
            });
          }
        };
        reader.readAsDataURL(blob);
        setIsRecording(false);
        setRecordSeconds(0);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setErrorMsg('Microphone permission denied or unavailable. Please allow mic access to send voice notes.');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleWhatsAppContinue = async () => {
    if (!selectedConv) return;
    setErrorMsg(null);
    setNeedsBuyerFee(false);
    setHandoffBanner(null);

    const res = await onWhatsAppHandoff(selectedConv.id);
    if (res.requiresBuyerFee) {
      setNeedsBuyerFee(true);
      setErrorMsg(res.error || 'Buyer account fee required.');
      return;
    }
    if (res.error) {
      setErrorMsg(res.error);
      return;
    }
    if (res.whatsappUrl) {
      setHandoffBanner(res.whatsappUrl);
    }
  };

  const isBillingSupportThread = selectedConv?.kind === 'billing_support';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="messaging-drawer-title"
    >
      <div className="flex h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5E7EB] bg-[#F9FAF8] px-5 py-3.5">
          <div>
            <h2 id="messaging-drawer-title" className="font-display text-lg font-bold text-[#111827]">
              In-App Messages &amp; Billing Notices
            </h2>
            <p className="text-xs text-[#4B5563]">
              Communicate safely with text, compressed produce photos, voice notes, and billing updates.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close messages"
            onClick={onClose}
            className="rounded-lg p-2 text-[#4B5563] hover:bg-white hover:text-[#111827]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Two-Pane Body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-12">
          {/* Left: Conversation List */}
          <div className="overflow-y-auto border-b border-[#E5E7EB] bg-[#F9FAF8] md:col-span-4 md:border-b-0 md:border-r">
            {myConversations.length === 0 ? (
              <div className="p-6 text-center text-sm text-[#4B5563]">
                No conversations yet. Click &ldquo;Message Seller In-App&rdquo; on any listing to start an inquiry.
              </div>
            ) : (
              <div className="divide-y divide-[#E5E7EB]">
                {myConversations.map((conv) => {
                  const otherName =
                    conv.buyerId === currentUser.id ? conv.sellerName : conv.buyerName;
                  const lastMsg = messages
                    .filter((m) => m.conversationId === conv.id)
                    .sort((a, b) => b.createdAt - a.createdAt)[0];
                  const isActive = selectedConv?.id === conv.id;

                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => onSelectConversation(conv.id)}
                      className={`w-full px-4 py-3.5 text-left transition-colors ${
                        isActive ? 'bg-white' : 'hover:bg-white/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-[#111827]">{otherName}</span>
                        <span className="shrink-0 font-mono text-[11px] text-[#4B5563] tabular-nums">
                          {new Date(conv.updatedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {conv.listingTitle && (
                        <div className="mt-0.5 truncate text-xs font-medium text-[#1B5E20]">
                          {conv.listingTitle}
                        </div>
                      )}
                      <div className="mt-1 truncate text-xs text-[#4B5563]">
                        {lastMsg
                          ? lastMsg.type === 'image'
                            ? 'Sent an image'
                            : lastMsg.type === 'voice'
                            ? 'Sent a voice note'
                            : lastMsg.text
                          : 'No messages yet'}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Active Thread */}
          <div className="flex min-h-0 flex-col md:col-span-8">
            {!selectedConv ? (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-sm text-[#4B5563]">
                <MessageSquare className="h-8 w-8 text-[#1B5E20]" />
                <p className="mt-2 font-medium text-[#111827]">Select a conversation to view messages</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-display text-sm font-bold text-[#111827]">
                      {selectedConv.buyerId === currentUser.id
                        ? selectedConv.sellerName
                        : selectedConv.buyerName}
                    </div>
                    {selectedConv.listingTitle && (
                      <div className="truncate text-xs text-[#4B5563]">
                        {isBillingSupportThread ? selectedConv.listingTitle : `Inquiry: ${selectedConv.listingTitle}`}
                      </div>
                    )}
                  </div>

                  {isBillingSupportThread && pendingPaymentStatus && onOpenPaymentCheckout && (
                    <button
                      type="button"
                      onClick={() => onOpenPaymentCheckout(pendingPaymentStatus.paymentType)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B5E20] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#154A19] whitespace-nowrap shrink-0"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      Pay Now ({formatZMW(pendingPaymentStatus.amountZmw)})
                    </button>
                  )}

                  {!isBillingSupportThread && selectedConv.buyerId === currentUser.id && (
                    <button
                      type="button"
                      onClick={handleWhatsAppContinue}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#1B5E20] px-3 py-1.5 text-xs font-semibold text-[#1B5E20] hover:bg-[#EEF3EC] whitespace-nowrap shrink-0"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Continue on WhatsApp
                    </button>
                  )}
                </div>

                {handoffBanner && (
                  <div className="flex items-center justify-between gap-3 border-b border-[#1B5E20]/20 bg-[#EEF3EC] px-5 py-2.5 text-xs text-[#1B5E20]">
                    <span>WhatsApp continuation logged in chat history.</span>
                    <a
                      href={handoffBanner}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-[#1B5E20] px-3 py-1 font-semibold text-white hover:bg-[#154A19]"
                    >
                      Open WhatsApp Chat
                    </a>
                  </div>
                )}

                <div className="flex-1 space-y-3 overflow-y-auto bg-[#F9FAF8] p-5">
                  {threadMessages.length === 0 ? (
                    <div className="py-12 text-center text-xs text-[#4B5563]">
                      Start the conversation below. Your phone number stays private until you choose to reveal or switch to WhatsApp.
                    </div>
                  ) : (
                    threadMessages.map((msg) => {
                      if (msg.type === 'system_handoff') {
                        return (
                          <div
                            key={msg.id}
                            className="mx-auto max-w-md rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-2 text-center text-xs text-[#4B5563]"
                          >
                            {msg.text}
                          </div>
                        );
                      }

                      if (msg.type === 'payment_notice') {
                        const showPayButton =
                          Boolean(msg.paymentType) &&
                          Boolean(pendingPaymentStatus) &&
                          currentUser.id === selectedConv.buyerId &&
                          Boolean(onOpenPaymentCheckout);

                        return (
                          <div
                            key={msg.id}
                            className="rounded-xl border border-[#F59E0B]/50 bg-[#FFFBEB] p-4 text-xs text-[#78350F]"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-[#92400E]">
                                {msg.senderName} · Automated Billing Notice
                              </span>
                              <span className="font-mono text-[10px] text-[#92400E] tabular-nums">
                                {new Date(msg.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <p className="mt-1.5 text-sm leading-relaxed text-[#78350F]">
                              {msg.text}
                            </p>
                            {showPayButton && msg.paymentType && onOpenPaymentCheckout && (
                              <div className="mt-3">
                                <button
                                  type="button"
                                  onClick={() => onOpenPaymentCheckout(msg.paymentType!)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B5E20] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#154A19]"
                                >
                                  <CreditCard className="h-3.5 w-3.5" />
                                  Pay Now via Mobile Money
                                  {typeof msg.amountZmw === 'number'
                                    ? ` (${formatZMW(msg.amountZmw)})`
                                    : ''}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      }

                      const isMine = msg.senderId === currentUser.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                              isMine
                                ? 'bg-[#1B5E20] text-white'
                                : 'border border-[#E5E7EB] bg-white text-[#111827]'
                            }`}
                          >
                            <div
                              className={`mb-1 text-[11px] font-semibold ${
                                isMine ? 'text-white/80' : 'text-[#4B5563]'
                              }`}
                            >
                              {msg.senderName}
                            </div>

                            {msg.type === 'image' && msg.mediaDataUrl && (
                              <div className="space-y-1.5">
                                <img
                                  src={msg.mediaDataUrl}
                                  alt={msg.text || 'Shared produce photo'}
                                  className="max-h-56 rounded-lg object-cover"
                                />
                                {msg.text && <div className="text-xs opacity-90">{msg.text}</div>}
                              </div>
                            )}

                            {msg.type === 'voice' && msg.mediaDataUrl && (
                              <div className="space-y-1">
                                <div className="text-xs font-medium">
                                  Voice Note ({msg.audioDurationSec || 1}s)
                                </div>
                                <audio controls src={msg.mediaDataUrl} className="h-8 max-w-full" />
                              </div>
                            )}

                            {msg.type === 'text' && <p className="whitespace-pre-wrap">{msg.text}</p>}
                          </div>
                          <span className="mt-1 font-mono text-[10px] text-[#6B7280] tabular-nums">
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={feedEndRef} />
                </div>

                {errorMsg && (
                  <div className="border-t border-[#C2410C]/30 bg-[#FFF7ED] px-5 py-2 text-xs text-[#9A3412]">
                    <span>{errorMsg}</span>
                    {needsBuyerFee && (
                      <button
                        type="button"
                        onClick={onOpenBuyerFeeCheckout}
                        className="ml-3 rounded bg-[#C2410C] px-2.5 py-1 font-semibold text-white"
                      >
                        Pay Buyer Fee
                      </button>
                    )}
                  </div>
                )}

                {/* Composer */}
                <form
                  onSubmit={handleSendText}
                  className="flex items-center gap-2 border-t border-[#E5E7EB] bg-white px-4 py-3"
                >
                  <label
                    className="cursor-pointer rounded-lg border border-[#E5E7EB] p-2.5 text-[#4B5563] hover:border-[#1B5E20] hover:text-[#1B5E20]"
                    title="Share produce photo"
                  >
                    <ImagePlus className="h-4 w-4" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="sr-only"
                      aria-label="Share image in chat"
                    />
                  </label>

                  {!isRecording ? (
                    <button
                      type="button"
                      onClick={handleStartRecording}
                      aria-label="Record voice note"
                      title="Record voice note"
                      className="rounded-lg border border-[#E5E7EB] p-2.5 text-[#4B5563] hover:border-[#1B5E20] hover:text-[#1B5E20]"
                    >
                      <Mic className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStopRecording}
                      aria-label="Stop and send voice note"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#C2410C] px-3 py-2 text-xs font-semibold text-white"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                      <span className="font-mono tabular-nums">{recordSeconds}s · Send</span>
                    </button>
                  )}

                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Type your message to discuss stock, moisture, or pickup..."
                    className="flex-1 rounded-lg border border-[#E5E7EB] bg-[#F9FAF8] px-3.5 py-2 text-sm text-[#111827] focus:border-[#1B5E20] focus:bg-white focus:outline-none"
                  />

                  <button
                    type="submit"
                    disabled={sending || !textInput.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B5E20] px-4 py-2 text-sm font-semibold text-white hover:bg-[#154A19] disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    <span>Send</span>
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
