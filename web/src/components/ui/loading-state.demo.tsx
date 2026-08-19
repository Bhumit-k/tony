import LoadingState from "@/components/ui/loading-state";

export default function LoadingStateDemo() {
  return (
    <div className="flex min-h-[280px] w-full items-center justify-center bg-background p-8">
      <div className="flex flex-col gap-7">
        <LoadingState label="Churning" variant="Drive" />
        <LoadingState label="Thinking" variant="Dots" />
        <LoadingState label="Searching" variant="Orbit" />
      </div>
    </div>
  );
}
