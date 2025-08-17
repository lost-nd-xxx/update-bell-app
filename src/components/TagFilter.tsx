import React from "react";
import { X } from "lucide-react";

interface TagFilterProps {
  allTags: string[];
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
}

const TagFilter: React.FC<TagFilterProps> = ({
  allTags,
  selectedTags,
  onTagToggle,
}) => {
  const clearAllTags = () => {
    selectedTags.forEach((tag) => onTagToggle(tag));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          タグフィルター:
        </label>
        {selectedTags.length > 0 && (
          <button
            onClick={clearAllTags}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            すべてクリア
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {allTags.map((tag) => {
          const isSelected = selectedTags.includes(tag);
          return (
            <button
              key={tag}
              onClick={() => onTagToggle(tag)}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-all ${
                isSelected
                  ? "bg-purple-600 text-white hover:bg-purple-700"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              #{tag}
              {isSelected && (
                <X
                  size={14}
                  className="ml-1 hover:bg-purple-500 rounded-full p-0.5"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* 選択中のタグ数表示 */}
      {selectedTags.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {selectedTags.length}個のタグでフィルタリング中
        </div>
      )}
    </div>
  );
};

export default TagFilter;
