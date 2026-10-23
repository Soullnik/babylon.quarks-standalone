/** One animated target of a prefab and when it plays. */
export interface IAnimationData {
    /** Start time in seconds */
    startTime: number;
    /** Duration in seconds */
    duration: number;
    /** Target object */
    target: any;
}

/** A group of effects, with the timing of each, that plays as one. */
export interface IPrefab {
    /**
     * The name of the prefab.
     */
    name: string;
    /**
     * The children of the prefab.
     */
    animationData: IAnimationData[];
}
