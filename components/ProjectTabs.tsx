import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { Project } from '../types';
import { useLanguage } from '../i18n/index.ts';

interface ProjectTabsProps {
    projects: Project[];
    activeProjectId: string | null;
    onSelectProject: (id: string) => void;
    onAddProject: () => void;
    onCloseProject: (id: string) => void;
    onRenameProject: (id: string, newName: string) => void;
    onDuplicateProject: (id: string) => void;
    onMoveProject: (draggedId: string, targetId: string, position: 'before' | 'after') => void;
}

const ProjectTabs: React.FC<ProjectTabsProps> = ({
    projects,
    activeProjectId,
    onSelectProject,
    onAddProject,
    onCloseProject,
    onRenameProject,
    onDuplicateProject,
    onMoveProject,
}) => {
    const { t } = useLanguage();
    const [editingTabId, setEditingTabId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const prevProjectsLengthRef = useRef(projects.length);

    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dropIndicator, setDropIndicator] = useState<{ targetId: string; position: 'before' | 'after' } | null>(null);

    useEffect(() => {
        if (projects.length > prevProjectsLengthRef.current) {
            const el = scrollContainerRef.current;
            if (el) {
                el.scrollTo({
                    left: el.scrollWidth,
                    behavior: 'smooth',
                });
            }
        }
        prevProjectsLengthRef.current = projects.length;
    }, [projects]);

    const checkForScroll = useCallback(() => {
        const el = scrollContainerRef.current;
        if (el) {
            const hasOverflow = el.scrollWidth > el.clientWidth;
            setCanScrollLeft(hasOverflow && el.scrollLeft > 1);
            setCanScrollRight(hasOverflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
        }
    }, []);

    useLayoutEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;

        checkForScroll();

        const resizeObserver = new ResizeObserver(checkForScroll);
        resizeObserver.observe(el);

        const mutationObserver = new MutationObserver(checkForScroll);
        mutationObserver.observe(el, { childList: true, subtree: true });

        return () => {
            resizeObserver.disconnect();
            mutationObserver.disconnect();
        };
    }, [projects, checkForScroll]);


    useEffect(() => {
        if (editingTabId && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingTabId]);
    
    const handleScroll = (direction: 'left' | 'right') => {
        const el = scrollContainerRef.current;
        if (el) {
            const scrollAmount = el.clientWidth * 0.8;
            el.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth',
            });
        }
    };

    const handleStartEditing = (project: Project) => {
        setEditingTabId(project.id);
        setEditingName(project.name);
    };

    const handleFinishEditing = () => {
        if (editingTabId && editingName.trim()) {
            onRenameProject(editingTabId, editingName.trim());
        }
        setEditingTabId(null);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEditingName(e.target.value);
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleFinishEditing();
        } else if (e.key === 'Escape') {
            setEditingTabId(null);
        }
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, projectId: string) => {
        e.dataTransfer.setData('projectId', projectId);
        setDraggedId(projectId);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
        e.preventDefault();
        if (targetId === draggedId) {
            setDropIndicator(null);
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const position = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
        if (dropIndicator?.targetId !== targetId || dropIndicator?.position !== position) {
            setDropIndicator({ targetId, position });
        }
    };
    
    const handleDragLeave = () => {
        setDropIndicator(null);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!dropIndicator) return;

        const droppedId = e.dataTransfer.getData('projectId');
        if (droppedId && droppedId !== dropIndicator.targetId) {
            onMoveProject(droppedId, dropIndicator.targetId, dropIndicator.position);
        }
        setDropIndicator(null);
        setDraggedId(null);
    };

    const handleDragEnd = () => {
        setDraggedId(null);
        setDropIndicator(null);
    };

    return (
        <div className="flex items-center border-b border-slate-300 mb-6 -mx-6 px-4">
            {canScrollLeft && (
                <button
                    onClick={() => handleScroll('left')}
                    className="z-10 p-1 rounded-full hover:bg-slate-200 transition-colors flex-shrink-0"
                    aria-label="Scroll tabs left"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
            )}
            <div
                ref={scrollContainerRef}
                onScroll={checkForScroll}
                className="flex-grow flex items-center gap-1 -mb-px overflow-x-auto scrollbar-hide"
            >
                <div
                    onClick={() => onSelectProject('summary-tab')}
                    className={`flex items-center border rounded-t-lg px-3 py-2 text-sm font-medium cursor-pointer transition-colors flex-shrink-0 ${
                        activeProjectId === 'summary-tab'
                            ? 'bg-white border-slate-300 border-b-white text-blue-600'
                            : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                    }`}
                >
                    <span className="whitespace-nowrap">{t('app.allProjectsSummaryTab')}</span>
                </div>
                {projects.map((project) => {
                    const isActive = project.id === activeProjectId;
                    const isBeingDragged = project.id === draggedId;
                    const isDropTargetBefore = dropIndicator?.targetId === project.id && dropIndicator.position === 'before';
                    const isDropTargetAfter = dropIndicator?.targetId === project.id && dropIndicator.position === 'after';
                    
                    return (
                        <div
                            key={project.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, project.id)}
                            onDragOver={(e) => handleDragOver(e, project.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onDragEnd={handleDragEnd}
                            className={`flex items-center border rounded-t-lg px-3 py-2 text-sm font-medium cursor-pointer transition-colors flex-shrink-0 relative ${
                                isActive
                                    ? 'bg-white border-slate-300 border-b-white text-blue-600'
                                    : 'bg-slate-100 border-transparent text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                            } ${isBeingDragged ? 'dragging' : ''}`}
                        >
                            {isDropTargetBefore && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-full" />}
                            {editingTabId === project.id ? (
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={editingName}
                                    onChange={handleInputChange}
                                    onBlur={handleFinishEditing}
                                    onKeyDown={handleInputKeyDown}
                                    className="bg-transparent outline-none border-b border-blue-500 w-24"
                                />
                            ) : (
                                <span
                                    onDoubleClick={() => handleStartEditing(project)}
                                    onClick={() => onSelectProject(project.id)}
                                    className="whitespace-nowrap max-w-[150px] truncate"
                                    title={project.name}
                                >
                                    {project.name}
                                </span>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDuplicateProject(project.id);
                                }}
                                className="ml-2 w-5 h-5 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-300 hover:text-slate-800"
                                aria-label={`${t('app.duplicateProject')} ${project.name}`}
                                title={t('app.duplicateProject')}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCloseProject(project.id);
                                }}
                                className="ml-1 w-5 h-5 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-300 hover:text-slate-800"
                                aria-label={`Close ${project.name}`}
                            >
                                &#x2715;
                            </button>
                             {isDropTargetAfter && <div className="absolute right-0 top-0 bottom-0 w-1 bg-blue-500 rounded-full" />}
                        </div>
                    );
                })}
            </div>
            {canScrollRight && (
                <button
                    onClick={() => handleScroll('right')}
                    className="z-10 p-1 rounded-full hover:bg-slate-200 transition-colors flex-shrink-0"
                    aria-label="Scroll tabs right"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            )}
            <button
                onClick={onAddProject}
                className="ml-2 flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-blue-600 hover:text-white transition-colors"
                aria-label="Add new project"
                title="Add new project"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
            </button>
        </div>
    );
};

export default ProjectTabs;