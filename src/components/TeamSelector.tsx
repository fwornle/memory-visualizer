import React, { useState, useEffect, useRef } from 'react';

interface TeamInfo {
  name: string;
  displayName: string;
  description: string;
  entities: number;
  file: string;
}

interface TeamSelectorProps {
  onTeamsChange?: (teams: string[]) => void;
}

export const TeamSelector: React.FC<TeamSelectorProps> = ({ onTeamsChange }) => {
  const [availableTeams, setAvailableTeams] = useState<TeamInfo[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Fetch available teams on mount
  useEffect(() => {
    fetchAvailableTeams();
    fetchCurrentTeams();
  }, []);

  // Handle mouse movement to show/hide sidebar
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const mouseX = e.clientX;
      const threshold = 20; // pixels from left edge
      
      if (mouseX < threshold && !isOpen) {
        setIsOpen(true);
      } else if (mouseX > 400 && !isHovering && isOpen) {
        // Close if mouse is far from sidebar and not hovering
        setIsOpen(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isOpen, isHovering]);

  // Auto-close sidebar after applying changes
  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => {
        setIsOpen(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  const fetchAvailableTeams = async () => {
    try {
      const response = await fetch('/api/available-teams');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setAvailableTeams(data.available);
    } catch (err) {
      console.warn('API not available, using fallback team list:', err);
      // Fallback: provide default teams when API isn't available
      setAvailableTeams([
        {
          name: 'coding',
          displayName: 'Coding',
          description: 'Core coding knowledge management',
          entities: 0,
          file: 'shared-memory-coding.json'
        },
        {
          name: 'ui',
          displayName: 'UI',
          description: 'User interface patterns and frontend',
          entities: 0,
          file: 'shared-memory-ui.json'
        },
        {
          name: 'resi',
          displayName: 'ReSi',
          description: 'Reprocessing and Simulation Framework',
          entities: 0,
          file: 'shared-memory-resi.json'
        }
      ]);
    }
  };

  const fetchCurrentTeams = async () => {
    try {
      const response = await fetch('/api/current-teams');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setSelectedTeams(data.teams);
      // Notify parent of initial selection
      if (onTeamsChange) {
        onTeamsChange(data.teams);
      }
    } catch (err) {
      console.warn('API not available for current teams, using fallback:', err);
      // Fallback: check localStorage or use default
      let teams: string[];
      try {
        const stored = localStorage.getItem('selectedTeams');
        if (stored) {
          teams = JSON.parse(stored);
        } else {
          teams = ['coding']; // Default to coding only
        }
      } catch (storageErr) {
        teams = ['coding']; // Default to coding only
      }
      setSelectedTeams(teams);
      // Notify parent of initial selection
      if (onTeamsChange) {
        onTeamsChange(teams);
      }
    }
  };

  const handleTeamToggle = async (teamName: string) => {
    const newSelectedTeams = selectedTeams.includes(teamName) 
      ? selectedTeams.filter(t => t !== teamName)
      : [...selectedTeams, teamName];
    
    setSelectedTeams(newSelectedTeams);
    
    // Auto-apply changes immediately
    await applyChanges(newSelectedTeams);
  };

  const applyChanges = async (teams: string[]) => {
    setLoading(true);
    setError(null);

    try {
      // Update server-side KNOWLEDGE_VIEW (optional - for persistence)
      try {
        await fetch('/api/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teams }),
        });
      } catch (err) {
        console.warn('Failed to update server KNOWLEDGE_VIEW, continuing with client-side filtering:', err);
      }

      // Call parent callback to trigger re-query with new teams
      if (onTeamsChange) {
        onTeamsChange(teams);
      }

      // Show success briefly
      setTimeout(() => {
        setLoading(false);
      }, 500);
    } catch (err) {
      setError('Failed to update teams');
      console.error('Team update failed:', err);
      setLoading(false);
    }
  };


  const getTotalEntities = () => {
    // Sum insight counts (patterns), but account for shared entities like CollectiveKnowledge
    const insightCount = selectedTeams.reduce((total, teamName) => {
      const team = availableTeams.find(t => t.name === teamName);
      return total + (team?.entities || 0);
    }, 0);
    
    // Add 1 for CollectiveKnowledge (shared across all teams)
    // Add project count (1 per selected team)
    const sharedEntities = selectedTeams.length > 0 ? 1 : 0; // CollectiveKnowledge
    const projectEntities = selectedTeams.length; // One project per team
    
    return insightCount + sharedEntities + projectEntities;
  };

  return (
    <>
      {/* Invisible trigger zone on the left edge */}
      <div
        ref={triggerRef}
        className="fixed left-0 top-0 w-5 h-full z-40 bg-transparent"
        style={{ pointerEvents: isOpen ? 'none' : 'auto' }}
      />

      {/* Backdrop overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-20 z-40 transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sliding sidebar */}
      <div
        ref={sidebarRef}
        className={`fixed left-0 top-0 h-full w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-600 to-slate-700 text-white p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Knowledge Base Views</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-slate-100 text-sm mt-2">
            Select views to compose your knowledge display
          </p>
        </div>

        {/* Content */}
        <div className="p-6 h-full overflow-y-auto">
          {/* Select/Deselect All Buttons */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={async () => {
                const allTeams = availableTeams.map(t => t.name);
                setSelectedTeams(allTeams);
                await applyChanges(allTeams);
              }}
              disabled={loading}
              className="flex-1 py-2 px-3 bg-slate-600 hover:bg-slate-700 disabled:bg-gray-300 text-white text-sm font-medium rounded transition-colors"
            >
              Select All
            </button>
            <button
              onClick={async () => {
                setSelectedTeams([]);
                await applyChanges([]);
              }}
              disabled={loading}
              className="flex-1 py-2 px-3 bg-gray-400 hover:bg-gray-500 disabled:bg-gray-300 text-white text-sm font-medium rounded transition-colors"
            >
              Deselect All
            </button>
          </div>

          {/* Team selection */}
          <div className="space-y-3 mb-6">
            {availableTeams.map(team => (
              <label
                key={team.name}
                className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors border border-gray-100"
              >
                <input
                  type="checkbox"
                  checked={selectedTeams.includes(team.name)}
                  onChange={() => handleTeamToggle(team.name)}
                  disabled={loading}
                  className="w-5 h-5 text-slate-600 rounded focus:ring-slate-500 focus:ring-2 disabled:opacity-50"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{team.displayName}</span>
                    <span className="text-sm font-medium text-slate-600 bg-slate-50 px-2 py-1 rounded-full">
                      {team.entities}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 truncate block">
                    {team.description}
                  </span>
                </div>
              </label>
            ))}
          </div>

          {/* Summary */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="text-sm text-gray-700">
              <div className="flex justify-between items-center mb-2">
                <span>Selected views:</span>
                <span className="font-semibold">{selectedTeams.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Total insights:</span>
                <span className="font-semibold text-slate-600">{getTotalEntities()}</span>
              </div>
            </div>
          </div>

          {/* Status indicator */}
          {loading && (
            <div className="w-full py-3 px-4 rounded-lg bg-green-500 text-white font-medium">
              <div className="flex items-center justify-center space-x-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Applying Changes...</span>
              </div>
            </div>
          )}
          
          {!loading && selectedTeams.length === 0 && (
            <div className="w-full py-3 px-4 rounded-lg bg-gray-100 text-gray-600 font-medium text-center">
              Select at least one view to display knowledge
            </div>
          )}
          
          {!loading && selectedTeams.length > 0 && (
            <div className="w-full py-3 px-4 rounded-lg bg-blue-50 text-blue-700 font-medium text-center">
              ✓ Changes applied automatically
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          {/* Environment info */}
          <div className="mt-6 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
            <div className="mb-2">
              <span className="font-medium">Current Environment:</span>
            </div>
            <code className="bg-white px-2 py-1 rounded border block">
              KNOWLEDGE_VIEW={selectedTeams.length > 0 ? selectedTeams.join(',') : 'default'}
            </code>
            <p className="mt-2 text-gray-400">
              Move mouse to left edge to open this panel
            </p>
          </div>
        </div>
      </div>
    </>
  );
};