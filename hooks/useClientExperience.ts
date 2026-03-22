import { useMemo } from 'react';
import { Contact } from '../types';
import {
  buildExperienceConfig,
  sortTargetsForExperience,
  sortTasksForExperience,
} from '../services/clientExperienceService';
import {
  BusinessFoundationProfileResponse,
  FundingRoadmapResponse,
  PortalTasksResponse,
} from '../services/fundingFoundationService';

type UseClientExperienceInput = {
  contact: Contact;
  roadmap: FundingRoadmapResponse | null;
  tasks: PortalTasksResponse | null;
  business: BusinessFoundationProfileResponse | null;
  credit: any;
  capital: any;
  isFunded: boolean;
};

export default function useClientExperience(input: UseClientExperienceInput) {
  const experienceConfig = useMemo(
    () =>
      buildExperienceConfig({
        contact: input.contact,
        roadmap: input.roadmap,
        tasks: input.tasks,
        business: input.business,
        credit: input.credit,
        capital: input.capital,
        isFunded: input.isFunded,
      }),
    [input.business, input.capital, input.contact, input.credit, input.isFunded, input.roadmap, input.tasks]
  );

  const sortedUrgent = useMemo(
    () => sortTasksForExperience(input.tasks?.urgent || [], experienceConfig),
    [experienceConfig, input.tasks?.urgent]
  );
  const sortedRecommended = useMemo(
    () => sortTasksForExperience(input.tasks?.recommended || [], experienceConfig),
    [experienceConfig, input.tasks?.recommended]
  );
  const sortedCompleted = useMemo(
    () => sortTasksForExperience(input.tasks?.completed || [], experienceConfig),
    [experienceConfig, input.tasks?.completed]
  );

  return {
    experienceConfig,
    sortTargets: sortTargetsForExperience,
    sortedUrgent,
    sortedRecommended,
    sortedCompleted,
  };
}