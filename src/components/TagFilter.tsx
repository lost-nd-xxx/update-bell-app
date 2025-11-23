import React from "react";

interface TagFilterProps {
  allTags: string[];
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
  onClearAll: () => void;
}

const TagFilter: React.FC<TagFilterProps> = ({
  allTags,
  selectedTags,
  onTagToggle,
  onClearAll,
}) => {
  return (
    <div className="flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-start pb-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 py-1">
            タグフィルター:
          </label>
          {selectedTags.length > 0 && (
            <button
              onClick={onClearAll}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors border border-gray-500/20 p-1 ml-2 rounded-md"
            >
              すべてクリア
            </button>
          )}
        </div>

        {allTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => onTagToggle(tag)}
                  className={`inline-flex items-center gap-1 px-3 py-1 my-0 rounded-full text-sm font-medium transition-all ${
                    isSelected
                      ? "bg-purple-600 text-white hover:bg-purple-700"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400 py-2">
            利用可能なタグはありません。
          </div>
        )}
      </div>

      <div className="h-4">
        {selectedTags.length > 0 ? (
          <div className="text-xs pt-1 text-gray-500 dark:text-gray-400">
            {selectedTags.length}個のタグでフィルタリング中
          </div>
        ) : allTags.length > 0 ? (
          <div className="text-xs pt-1 text-gray-500 dark:text-gray-400">
            タグで絞り込めます。
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TagFilter;
