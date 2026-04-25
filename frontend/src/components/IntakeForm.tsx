import { useState } from 'react';
import { submitIntake } from '../api/api';

interface FormData {
  // Company Info
  companyName: string;
  website: string;
  industry: string;
  // ICP Details
  targetIndustries: string;
  companySize: string;
  geography: string;
  // Buyer Details
  jobTitles: string;
  seniority: string;
  painPoints: string;
  // GTM Context
  competitors: string;
  channels: string;
  crm: string;
}

const initialData: FormData = {
  companyName: '',
  website: '',
  industry: '',
  targetIndustries: '',
  companySize: '',
  geography: '',
  jobTitles: '',
  seniority: '',
  painPoints: '',
  competitors: '',
  channels: '',
  crm: '',
};

const steps = [
  { id: 1, name: 'Company Info', fields: ['companyName', 'website', 'industry'] },
  { id: 2, name: 'ICP Details', fields: ['targetIndustries', 'companySize', 'geography'] },
  { id: 3, name: 'Buyer Details', fields: ['jobTitles', 'seniority', 'painPoints'] },
  { id: 4, name: 'GTM Context', fields: ['competitors', 'channels', 'crm'] },
];

export function IntakeForm() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(initialData);
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormData]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateStep = (step: number): boolean => {
    const currentStepData = steps.find(s => s.id === step);
    if (!currentStepData) return false;

    const newErrors: Partial<FormData> = {};
    let isValid = true;

    currentStepData.fields.forEach(field => {
      if (!formData[field as keyof FormData]?.trim()) {
        newErrors[field as keyof FormData] = 'This field is required';
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(4)) return;

    setIsLoading(true);
    setSubmitError('');
    try {
      const { error } = await submitIntake(formData);

      if (error) {
        setSubmitError(error.message);
        return;
      }

      setIsSuccess(true);
    } catch (error) {
      console.error('Error submitting intake:', error);
      setSubmitError('Unable to submit the intake form right now.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-green-900">Submission Successful!</h3>
        <p className="mt-2 text-green-700">Your intake form has been submitted successfully.</p>
        <button
          onClick={() => {
            setIsSuccess(false);
            setFormData(initialData);
            setCurrentStep(1);
          }}
          className="mt-6 rounded-lg bg-green-600 px-6 py-2 text-white transition-colors hover:bg-green-700"
        >
          Submit Another
        </button>
      </div>
    );
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Company Information</h3>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Company Name *</label>
              <input
                type="text"
                name="companyName"
                value={formData.companyName}
                onChange={handleChange}
                className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                  errors.companyName
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-500'
                }`}
                placeholder="Enter company name"
              />
              {errors.companyName && <p className="mt-1 text-sm text-red-500">{errors.companyName}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Website *</label>
              <input
                type="url"
                name="website"
                value={formData.website}
                onChange={handleChange}
                className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                  errors.website
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-500'
                }`}
                placeholder="https://example.com"
              />
              {errors.website && <p className="mt-1 text-sm text-red-500">{errors.website}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Industry *</label>
              <select
                name="industry"
                value={formData.industry}
                onChange={handleChange}
                className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                  errors.industry
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-500'
                }`}
              >
                <option value="">Select industry</option>
                <option value="SaaS">SaaS</option>
                <option value="Fintech">Fintech</option>
                <option value="Healthcare">Healthcare</option>
                <option value="E-commerce">E-commerce</option>
                <option value="Manufacturing">Manufacturing</option>
                <option value="Other">Other</option>
              </select>
              {errors.industry && <p className="mt-1 text-sm text-red-500">{errors.industry}</p>}
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">ICP Details</h3>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Target Industries *</label>
              <input
                type="text"
                name="targetIndustries"
                value={formData.targetIndustries}
                onChange={handleChange}
                className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                  errors.targetIndustries
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-500'
                }`}
                placeholder="e.g., SaaS, Fintech, Healthcare"
              />
              {errors.targetIndustries && <p className="mt-1 text-sm text-red-500">{errors.targetIndustries}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Company Size *</label>
              <select
                name="companySize"
                value={formData.companySize}
                onChange={handleChange}
                className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                  errors.companySize
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-500'
                }`}
              >
                <option value="">Select company size</option>
                <option value="1-10">1-10 employees</option>
                <option value="11-50">11-50 employees</option>
                <option value="51-200">51-200 employees</option>
                <option value="201-500">201-500 employees</option>
                <option value="501-1000">501-1000 employees</option>
                <option value="1000+">1000+ employees</option>
              </select>
              {errors.companySize && <p className="mt-1 text-sm text-red-500">{errors.companySize}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Geography *</label>
              <input
                type="text"
                name="geography"
                value={formData.geography}
                onChange={handleChange}
                className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                  errors.geography
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-500'
                }`}
                placeholder="e.g., North America, EMEA, Global"
              />
              {errors.geography && <p className="mt-1 text-sm text-red-500">{errors.geography}</p>}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Buyer Details</h3>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Job Titles *</label>
              <input
                type="text"
                name="jobTitles"
                value={formData.jobTitles}
                onChange={handleChange}
                className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                  errors.jobTitles
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-500'
                }`}
                placeholder="e.g., VP of Sales, Marketing Director"
              />
              {errors.jobTitles && <p className="mt-1 text-sm text-red-500">{errors.jobTitles}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Seniority *</label>
              <select
                name="seniority"
                value={formData.seniority}
                onChange={handleChange}
                className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                  errors.seniority
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-500'
                }`}
              >
                <option value="">Select seniority level</option>
                <option value="C-Level">C-Level</option>
                <option value="VP">VP</option>
                <option value="Director">Director</option>
                <option value="Manager">Manager</option>
                <option value="Individual Contributor">Individual Contributor</option>
              </select>
              {errors.seniority && <p className="mt-1 text-sm text-red-500">{errors.seniority}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Pain Points *</label>
              <textarea
                name="painPoints"
                value={formData.painPoints}
                onChange={handleChange}
                rows={4}
                className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                  errors.painPoints
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-500'
                }`}
                placeholder="Describe the pain points your buyers face"
              />
              {errors.painPoints && <p className="mt-1 text-sm text-red-500">{errors.painPoints}</p>}
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">GTM Context</h3>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Competitors *</label>
              <input
                type="text"
                name="competitors"
                value={formData.competitors}
                onChange={handleChange}
                className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                  errors.competitors
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-500'
                }`}
                placeholder="e.g., Competitor A, Competitor B"
              />
              {errors.competitors && <p className="mt-1 text-sm text-red-500">{errors.competitors}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Channels *</label>
              <input
                type="text"
                name="channels"
                value={formData.channels}
                onChange={handleChange}
                className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                  errors.channels
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-500'
                }`}
                placeholder="e.g., LinkedIn, Email, Events"
              />
              {errors.channels && <p className="mt-1 text-sm text-red-500">{errors.channels}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">CRM *</label>
              <select
                name="crm"
                value={formData.crm}
                onChange={handleChange}
                className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                  errors.crm
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-300 focus:ring-blue-500'
                }`}
              >
                <option value="">Select CRM</option>
                <option value="Salesforce">Salesforce</option>
                <option value="HubSpot">HubSpot</option>
                <option value="Pipedrive">Pipedrive</option>
                <option value="Zoho">Zoho</option>
                <option value="Other">Other</option>
                <option value="None">None</option>
              </select>
              {errors.crm && <p className="mt-1 text-sm text-red-500">{errors.crm}</p>}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      {/* Step Progress Indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  currentStep > step.id
                    ? 'bg-green-600 text-white'
                    : currentStep === step.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {currentStep > step.id ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.id
                )}
              </div>
              <span
                className={`ml-2 text-sm font-medium ${
                  currentStep >= step.id ? 'text-slate-900' : 'text-slate-500'
                }`}
              >
                {step.name}
              </span>
              {index < steps.length - 1 && (
                <div
                  className={`mx-4 h-0.5 w-16 ${
                    currentStep > step.id ? 'bg-green-600' : 'bg-slate-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Form Content */}
      <div className="min-h-[300px]">{renderStep()}</div>

      {submitError ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {submitError}
        </div>
      ) : null}

      {/* Navigation Buttons */}
      <div className="mt-6 flex justify-between border-t border-slate-200 pt-6">
        <button
          onClick={handleBack}
          disabled={currentStep === 1}
          className={`rounded-lg px-6 py-2 font-medium transition-colors ${
            currentStep === 1
              ? 'cursor-not-allowed bg-slate-100 text-slate-400'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Back
        </button>
        {currentStep < 4 ? (
          <button
            onClick={handleNext}
            className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="rounded-lg bg-green-600 px-6 py-2 font-medium text-white transition-colors hover:bg-green-700 disabled:bg-green-400"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Submitting...
              </span>
            ) : (
              'Submit'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
