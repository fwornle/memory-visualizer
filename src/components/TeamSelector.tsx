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
      const data = await response.json();
      setAvailableTeams(data.available);
    } catch (err) {
      console.error('Failed to fetch available teams:', err);
      setError('Failed to load available teams');
    }
  };

  const fetchCurrentTeams = async () => {
    try {
      const response = await fetch('/api/current-teams');
      const data = await response.json();
      setSelectedTeams(data.teams);
    } catch (err) {
      console.error('Failed to fetch current teams:', err);
    }
  };

  const handleTeamToggle = (teamName: string) => {
    setSelectedTeams(prev => {
      if (prev.includes(teamName)) {
        return prev.filter(t => t !== teamName);
      } else {
        return [...prev, teamName];
      }
    });
  };

  const handleApplyChanges = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ teams: selectedTeams }),
      });

      const data = await response.json();

      if (data.success) {
        // Wait briefly to show success, then reload
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } else {
        setError(data.error || 'Failed to update teams');
        setLoading(false);
      }
    } catch (err) {
      setError('Failed to update teams');
      console.error('Failed to update teams:', err);
      setLoading(false);
    }
  };

  const getTotalEntities = () => {
    return selectedTeams.reduce((total, teamName) => {
      const team = availableTeams.find(t => t.name === teamName);
      return total + (team?.entities || 0);
    }, 0);
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
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Knowledge Base Teams</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-blue-100 text-sm mt-2">
            Select teams to compose your knowledge view
          </p>
        </div>

        {/* Content */}
        <div className="p-6 h-full overflow-y-auto">
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
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 focus:ring-2"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{team.displayName}</span>
                    <span className="text-sm font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
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
                <span>Selected teams:</span>
                <span className="font-semibold">{selectedTeams.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Total entities:</span>
                <span className="font-semibold text-blue-600">{getTotalEntities()}</span>
              </div>
            </div>
          </div>

          {/* Apply button */}
          <button
            onClick={handleApplyChanges}
            disabled={loading || selectedTeams.length === 0}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
              loading
                ? 'bg-green-500 text-white cursor-not-allowed'
                : selectedTeams.length === 0
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg transform hover:-translate-y-0.5'
            }`}
          >
            {loading ? (
              <div className="flex items-center justify-center space-x-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Applied Successfully!</span>
              </div>
            ) : (
              'Apply Selection'
            )}
          </button>

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
              CODING_TEAM={selectedTeams.length > 0 ? selectedTeams.join(',') : 'default'}
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