import { AgentAvatar } from '@/shared/components/common/agent-avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  createSelectAvailableHeightLimit,
} from '@/shared/components/ui/select';
import type { AgentProfileView } from '@/shared/lib/api';
import { t } from '@/shared/lib/i18n';

type ChatWelcomeAgentPickerProps = {
  agents: AgentProfileView[];
  selectedAgent: AgentProfileView | null;
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
};

const AGENT_PICKER_MAX_HEIGHT = createSelectAvailableHeightLimit('18rem');

function resolveWelcomeAgentName(agent: AgentProfileView): string {
  if (agent.id.trim().toLowerCase() === 'main') {
    return '上海移动西格玛';
  }
  return agent.displayName?.trim() || agent.id;
}

export function ChatWelcomeAgentPicker({
  agents,
  selectedAgent,
  selectedAgentId,
  onSelectAgent,
}: ChatWelcomeAgentPickerProps) {
  return (
    <Select value={selectedAgentId} onValueChange={onSelectAgent}>
      <SelectTrigger
        aria-label={t('chatDraftAgentTitle')}
        className="h-auto w-auto min-w-0 gap-1 rounded-lg border-0 bg-transparent px-2 py-1.5 text-muted-foreground shadow-none hover:bg-[var(--interaction-hover)] hover:text-accent-foreground focus:ring-0"
      >
        <span className="sr-only">{t('chatDraftAgentTitle')}</span>
        <div className="flex min-w-0 items-center gap-1.5">
          {selectedAgent ? (
            <>
              <AgentAvatar
                agentId={selectedAgent.id}
                displayName={resolveWelcomeAgentName(selectedAgent)}
                avatarUrl={selectedAgent.avatarUrl}
                className="h-5 w-5 shrink-0"
              />
              <span className="max-w-28 truncate text-sm font-medium">
                {resolveWelcomeAgentName(selectedAgent)}
              </span>
            </>
          ) : null}
        </div>
      </SelectTrigger>
      <SelectContent
        className="rounded-xl border-border shadow-lg"
        style={{ maxHeight: AGENT_PICKER_MAX_HEIGHT }}
      >
        {agents.map((agent) => (
          <SelectItem key={agent.id} value={agent.id} className="rounded-lg pr-10">
            <div className="flex min-w-0 items-center gap-2">
              <AgentAvatar
                agentId={agent.id}
                displayName={resolveWelcomeAgentName(agent)}
                avatarUrl={agent.avatarUrl}
                className="h-5 w-5 shrink-0"
              />
              <span className="truncate text-sm font-medium text-foreground">
                {resolveWelcomeAgentName(agent)}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
