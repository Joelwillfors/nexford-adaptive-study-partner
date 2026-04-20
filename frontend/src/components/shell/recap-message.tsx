"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Target,
  TrendingDown,
} from "lucide-react";
import type { RecapMessage as RecapMessageType } from "@/lib/ai/schemas";

export function RecapMessage({ message }: { message: RecapMessageType }) {
  const isTopicClosed = message.variant === "topic_closed";
  const headerPill = isTopicClosed ? "Topic closed" : "Topic Recap";
  const masteredLabel = isTopicClosed ? "Concepts covered" : "Mastered today";
  const masteredIcon = isTopicClosed ? (
    <BookOpen className="h-4 w-4 text-[#6b7280]" />
  ) : (
    <CheckCircle2 className="h-4 w-4 text-green-600" />
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex justify-start"
    >
      <div className="w-full overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
        <div className="border-b border-[#e5e7eb] bg-[#0f0f0f] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#ffb300]">
            {headerPill}
          </p>
        </div>
        <div className="space-y-4 p-4">
          {message.mastered.length > 0 && (
            <Row
              icon={masteredIcon}
              label={masteredLabel}
              items={message.mastered}
            />
          )}
          {message.struggled.length > 0 && (
            <Row
              icon={<TrendingDown className="h-4 w-4 text-orange-600" />}
              label="Struggled with"
              items={message.struggled}
            />
          )}
          {message.next_focus && (
            <div className="flex items-start gap-2 rounded-lg bg-[#fefce8] p-3">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-[#92400e]" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#92400e]">
                  Next session
                </p>
                <p className="text-sm text-[#0f0f0f]">{message.next_focus}</p>
              </div>
            </div>
          )}
          {message.principle && (
            <p className="border-t border-[#e5e7eb] pt-3 text-sm italic text-[#6b7280]">
              {message.principle}
            </p>
          )}
          <a
            href="/journey"
            className="inline-flex items-center gap-1 text-xs font-medium text-[#0f0f0f] hover:text-[#ffb300]"
          >
            View full learning journey
            <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}

function Row({
  icon,
  label,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  items: string[];
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">
          {label}
        </span>
      </div>
      <ul className="space-y-0.5 pl-6">
        {items.map((x, i) => (
          <li key={i} className="text-sm text-[#0f0f0f]">
            • {x}
          </li>
        ))}
      </ul>
    </div>
  );
}
