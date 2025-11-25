import React from "react";

const ManageQuestionsPage = () => {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4 text-primary">Manage Questions</h1>
      <p className="text-lg text-muted-foreground mb-8">Here you can view, edit, and organize your question bank.</p>
      {/* Add your management UI here */}
      <div className="rounded-xl border bg-card p-8 shadow-md">
        <p className="text-center text-muted-foreground">No questions to display yet.</p>
      </div>
    </div>
  );
};

export default ManageQuestionsPage;
