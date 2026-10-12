import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import type { NavTab } from './components/Navigation';
import { AskPage } from './pages/AskPage';
import { DebatePage } from './pages/DebatePage';
import { LibraryPage } from './pages/LibraryPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { ReviewQueuePage } from './pages/ReviewQueuePage';
import { api } from './services/api';
import type { Conversation } from './types/api';

const VALID_TABS: NavTab[] = ['ask', 'debate', 'library', 'history', 'queue', 'settings'];

function getInitialTab(): NavTab {
  try {
    const hash = window.location.hash.replace('#', '') as NavTab;
    if (VALID_TABS.includes(hash)) {
      return hash;
    }
    const saved = localStorage.getItem('daleel_active_tab') as NavTab;
    if (VALID_TABS.includes(saved)) {
      return saved;
    }
  } catch {}
  return 'ask';
}

export function App() {
  const [language, setLanguage] = useState<'en' | 'ur'>('en');
  const [activeTab, setActiveTabState] = useState<NavTab>(getInitialTab);
  const [activeModel, setActiveModel] = useState<string>('gemini-3.8-flash');
  const [isOnlineMode, setIsOnlineMode] = useState<boolean>(true);
  const [quranCount, setQuranCount] = useState<number>(6236);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Conversation history state managed at root
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  const setActiveTab = useCallback((tab: NavTab) => {
    setActiveTabState(tab);
    try {
      window.location.hash = tab;
      localStorage.setItem('daleel_active_tab', tab);
    } catch {}
  }, []);

  // Listen for browser back/forward or direct hash links
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as NavTab;
      if (VALID_TABS.includes(hash)) {
        setActiveTabState(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Sync HTML dir and lang attributes
  useEffect(() => {
    document.documentElement.setAttribute('dir', language === 'ur' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', language);
  }, [language]);

  // Load initial health and conversation history
  useEffect(() => {
    api.getHealth()
      .then((h) => {
        if (h.active_model) setActiveModel(h.active_model);
        setIsOnlineMode(h.active_provider === 'gemini');
        if (h.quran_records_loaded) setQuranCount(h.quran_records_loaded);
      })
      .catch((err) => {
        console.warn('Backend not yet reachable on startup:', err);
      });

    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const list = await api.listConversations();
      setConversations(list);
    } catch (e: any) {
      console.warn('Could not load conversations:', e);
    }
  };

  const handleSelectConversation = (id: string) => {
    setActiveConvId(id);
    setActiveTab('ask');
  };

  const handleNewConversation = () => {
    setActiveConvId(null);
    setActiveTab('ask');
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await api.deleteConversation(id);
      if (activeConvId === id) {
        setActiveConvId(null);
      }
      loadConversations();
    } catch (e: any) {
      console.error('Failed to delete conversation:', e);
    }
  };

  const handleResumeConversation = (convId: string) => {
    setActiveConvId(convId);
    setActiveTab('ask');
  };

  const handleOpenDebate = (_debateId: string) => {
    setActiveTab('debate');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        backgroundColor: 'var(--bg-base)',
        overflow: 'hidden'
      }}
    >
      {/* Top Header */}
      <Header
        language={language}
        onLanguageChange={setLanguage}
        activeModel={activeModel}
        isOnlineMode={isOnlineMode}
        quranCount={quranCount}
        onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onNavigateSettings={(tab) => setActiveTab(tab)}
      />

      {/* Main Workspace: Collapsible Sidebar + Content View */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          language={language}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          conversations={conversations}
          activeConvId={activeConvId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
        />

        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
            backgroundColor: 'var(--bg-base)'
          }}
        >
          {activeTab === 'ask' && (
            <AskPage
              language={language}
              activeConvId={activeConvId}
              onActiveConvChange={setActiveConvId}
              onConversationsUpdated={loadConversations}
              onOpenLiveVoice={() => setActiveTab('debate')}
            />
          )}

          {activeTab === 'debate' && <DebatePage language={language} />}

          {activeTab === 'library' && <LibraryPage language={language} />}

          {activeTab === 'history' && (
            <HistoryPage
              language={language}
              onResumeConversation={handleResumeConversation}
              onOpenDebate={handleOpenDebate}
            />
          )}

          {activeTab === 'queue' && <ReviewQueuePage language={language} />}

          {activeTab === 'settings' && <SettingsPage language={language} />}
        </main>
      </div>
    </div>
  );
}

export default App;
