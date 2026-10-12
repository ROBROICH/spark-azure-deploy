---
ruleId: clean-code/references/context-logic-hook-examples
---

# Context Logic Hook Examples

## Anti-Pattern

```tsx
export type TopicContextValue = {
  selectedId: string;
  loading: boolean;
  items: Item[];
  selectedItem: Item | undefined;
  openItem: (item: Item) => void;
  closeItem: () => void;
};

const TopicContext = createContext<TopicContextValue | null>(null);

export const TopicProvider = (props: {
  children: React.ReactNode;
  value: TopicContextValue;
}) => {
  const { children, value } = props;
  return (
    <TopicContext.Provider value={value}>{children}</TopicContext.Provider>
  );
};
```

This is a typed forwarding wrapper, not a context structured around a logic hook.

## Good Example

```tsx
const useTopicCheckContextLogic = (params: TopicCheckProviderParams) => {
  const navigate = route.useNavigate();
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});

  const selectedDocument =
    params.documents.find(
      (document) => document.id === params.previewDocumentId,
    ) ?? null;

  const openDocument = (document: DocumentItem) => {
    navigate({
      search: (prev) => ({
        ...prev,
        previewDocumentId: document.id,
      }),
      resetScroll: false,
    });
  };

  const toggleExpanded = (id: string) => {
    setExpandedById((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return {
    selectedDocument,
    expandedById,
    openDocument,
    toggleExpanded,
  };
};

type TopicCheckContextValue = ReturnType<typeof useTopicCheckContextLogic>;

const TopicCheckContext = createContext<TopicCheckContextValue | null>(null);

export const useTopicCheckContext = () => {
  const context = useContext(TopicCheckContext);
  if (!context) {
    throw new Error(
      'useTopicCheckContext must be used within a TopicCheckProvider',
    );
  }
  return context;
};

export const TopicCheckProvider = (props: TopicCheckProviderProps) => {
  const { children, ...params } = props;
  const value = useTopicCheckContextLogic(params);

  return (
    <TopicCheckContext.Provider value={value}>
      {children}
    </TopicCheckContext.Provider>
  );
};
```

The business logic lives in `useTopicCheckContextLogic`, and the provider instantiates that hook instead of receiving a preassembled value object from the screen.
