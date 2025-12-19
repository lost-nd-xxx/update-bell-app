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
        {allTags.length > 0 ? (
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={onClearAll}
              disabled={selectedTags.length === 0}
              className={`text-xs transition-colors border border-gray-500/20 px-2 py-1 rounded-md ${
                selectedTags.length > 0
                  ? "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  : "text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-50"
              }`}
            >
              すべてクリア
            </button>
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
    </div>
  );
};

export default TagFilter;
